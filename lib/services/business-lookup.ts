const FIA_API_BASE = "https://eip.fia.gov.tw/OAI/api/businessRegistration";

/**
 * Look up a business name from Taiwan's FIA registry by tax ID (統一編號).
 * Best-effort only — returns null on any failure (network, invalid response, etc.).
 * Pass an AbortSignal to allow callers (e.g. React effects) to cancel in-flight requests.
 */
export async function lookupBusinessName(
  taxId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!/^\d{8}$/.test(taxId)) return null;

  try {
    const res = await fetch(`${FIA_API_BASE}/${taxId}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.businessNm || null;
  } catch {
    return null;
  }
}

type ConfidenceLevel = "low" | "medium" | "high";

interface ConfidenceMap {
  [field: string]: ConfidenceLevel | undefined;
}

interface PartyFields {
  name: string | undefined;
  taxId: string | undefined;
  nameField: string;
  taxIdField: string;
}

/**
 * Overwrite one party's fields with the canonical client record.
 * Trust the firm's record over Gemini's OCR for whichever side is the client.
 */
function applyKnownClient<T extends { confidence?: ConfidenceMap }>(
  data: T,
  side: "buyer" | "seller",
  client: { name: string; taxId: string },
): T {
  const nameField = `${side}Name`;
  const taxIdField = `${side}TaxId`;
  const result: Record<string, unknown> = { ...data };
  result[nameField] = client.name;
  result[taxIdField] = client.taxId;
  if (data.confidence) {
    result.confidence = {
      ...data.confidence,
      [nameField]: "high",
      [taxIdField]: "high",
    };
  }
  return result as T;
}

function partyOf<T>(data: T, side: "buyer" | "seller"): PartyFields {
  const nameField = `${side}Name`;
  const taxIdField = `${side}TaxId`;
  const record = data as Record<string, unknown>;
  return {
    name: record[nameField] as string | undefined,
    taxId: record[taxIdField] as string | undefined,
    nameField,
    taxIdField,
  };
}

/**
 * Apply the firm's canonical client record to whichever side it represents
 * (buyer for 進項, seller for 銷項), then FIA-look-up the other party only.
 * Falls back to enriching both sides when no client record is available.
 */
export async function enrichExtractedParties<
  T extends { confidence?: ConfidenceMap },
>(
  data: T,
  inOrOut: "in" | "out",
  client: { name: string; taxId: string } | null,
): Promise<T> {
  if (!client?.taxId) {
    return await enrichBusinessNames(data, [
      partyOf(data, "seller"),
      partyOf(data, "buyer"),
    ]);
  }

  const clientSide = inOrOut === "in" ? "buyer" : "seller";
  const otherSide = inOrOut === "in" ? "seller" : "buyer";
  const dataWithClient = applyKnownClient(data, clientSide, client);
  return await enrichBusinessNames(dataWithClient, [
    partyOf(dataWithClient, otherSide),
  ]);
}

/**
 * Enrich extracted data with business names from FIA lookup.
 * Skips lookup when:
 * - taxId is missing or not 8 digits
 * - taxId confidence is "low" (likely a bad OCR read)
 * - name already has "high" confidence
 */
export async function enrichBusinessNames<
  T extends { confidence?: ConfidenceMap },
>(
  data: T,
  parties: PartyFields[],
): Promise<T> {
  const enriched = { ...data };
  const confidence: ConfidenceMap = { ...data.confidence };

  const lookups = parties.map(async (party) => {
    const taxId = party.taxId;
    if (!taxId || !/^\d{8}$/.test(taxId)) return;

    // Skip if the tax ID itself has low confidence
    const taxIdConfidence = confidence[party.taxIdField];
    if (taxIdConfidence === "low") return;

    // Skip if name already has high confidence
    const nameConfidence = confidence[party.nameField];
    if (nameConfidence === "high") return;

    // Skip if name is present and has no confidence data (e.g. from excel import)
    if (party.name && !data.confidence) return;

    const name = await lookupBusinessName(taxId);
    if (name) {
      (enriched as Record<string, unknown>)[party.nameField] = name;
      confidence[party.nameField] = "high";
    }
  });

  await Promise.all(lookups);

  if (data.confidence) {
    (enriched as Record<string, unknown>).confidence = confidence;
  }

  return enriched;
}
