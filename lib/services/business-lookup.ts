const FIA_API_BASE = "https://eip.fia.gov.tw/OAI/api/businessRegistration";

/**
 * Look up a business name from Taiwan's FIA registry by tax ID (統一編號).
 * Best-effort only — returns null on any failure (network, invalid response, etc.).
 */
export async function lookupBusinessName(
  taxId: string,
): Promise<string | null> {
  if (!/^\d{8}$/.test(taxId)) return null;

  try {
    const res = await fetch(`${FIA_API_BASE}/${taxId}`);
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
