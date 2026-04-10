/**
 * Extraction Worker Edge Function
 *
 * Triggered by pg_cron every 10 seconds. Reads a batch of messages from the
 * pgmq extraction_jobs queue and processes them by calling the Gemini API
 * for invoice/allowance data extraction.
 *
 * Concurrency: processes up to CONCURRENCY_LIMIT messages in parallel per batch.
 * Retry: pgmq visibility timeout handles retries. After 3 failed reads, archives as failed.
 */

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { encodeBase64 } from "jsr:@std/encoding@^1/base64"

const BATCH_SIZE = 5;
const CONCURRENCY_LIMIT = 2;
const VISIBILITY_TIMEOUT = 120; // seconds
const MAX_READ_COUNT = 3;
const GEMINI_MODEL = "gemini-2.5-flash";

// ─── Account list for 進項 invoice account determination ────────────────────
// Inlined from lib/data/accounts.ts ACCOUNT_LIST
const ACCOUNT_LIST = [
  "1111 現金", "1112 銀行存款", "1113 約當現金", "1114 短期性之投資",
  "1121 應收票據", "1122 應收票據-備抵呆帳", "1123 應收帳款",
  "1124 應收帳款-備抵呆帳", "1125 合約資產-流動", "1126 減:累計減損",
  "1129 其他應收款", "1131 商品存貨", "1132 製成品存貨",
  "1133 在製品(在建工程)存貨", "1134 原料存貨", "1135 物料存貨",
  "1136 寄銷品存貨", "1137 減:備抵存貨跌價", "1138 存貨-其他",
  "1141 預付費用", "1142 用品盤存", "1143 預付貨款", "1144 進項稅額",
  "1145 留抵稅額", "1149 其他預付款", "1151 公允價值之金融資產",
  "1154 避險之金融資產", "1157 其他金融資產", "1158 其他綜合損益公允價值",
  "1159 減:累計減損", "1161 按攤銷後成本衡量資產", "1191 暫付款",
  "1192 股東往來", "1193 同業往來", "1199 其他流動資產-其他",
  "4101 營業收入", "4102 其他營業收入", "4201 銷貨退回", "4202 銷貨折讓",
  "5021 進貨", "5022 進貨退出", "5023 進貨折讓",
  "5040 進貨-其他(加項)", "5050 進貨-其他(減項)",
  "5121 原料", "5122 原料退出", "5123 原料折讓",
  "5221 物料", "5222 物料退出", "5223 物料折讓",
  "5300 直接人工", "5401 間接人工-(製)", "5402 租金支出-(製)",
  "5403 文具用品-(製)", "5404 旅費-(製)", "5405 運費-(製)",
  "5406 郵電費-(製)", "5407 修繕費-(製)", "5409 水電瓦斯費-(製)",
  "5410 保險費-(製)", "5411 加工費-(製)", "5412 稅捐-(製)",
  "5413 折舊-(製)", "5415 伙食費-(製)", "5416 職工福利-(製)",
  "5490 其他製造費用", "5600 勞務成本", "5700 修理成本",
  "5800 加工成本", "5810 業務成本", "5900 其他營業成本",
  "6110 薪資支出", "6111 租金支出", "6112 文具用品", "6113 旅費",
  "6114 運費", "6115 郵電費", "6116 修繕費", "6117 廣告費",
  "6118 水電瓦斯費", "6119 保險費", "6120 交際費", "6121 捐贈",
  "6122 稅捐", "6123 呆帳損失", "6124 折舊", "6125 各項耗竭及攤提",
  "6127 伙食費", "6128 職工福利", "6130 佣金支出", "6131 訓練費",
  "6132 其他費用", "7035 一般股息與紅利", "7038 利息收入",
  "7039 租賃收入", "7040 出售資產盈餘", "7044 其他收入",
  "7097 退稅收入", "8046 利息支出", "8048 出售資產損失",
  "8051 兌換虧損", "8052 其它損失", "9999 所得稅費用",
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface QueueMessage {
  entity_type: "invoice" | "allowance";
  entity_id: string;
  firm_id: string;
  client_id: string;
  tax_filing_period_id: string;
}

interface PgmqMessage {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: QueueMessage;
}

interface ClientInfo {
  name: string;
  taxId: string;
  industry: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
  }>;
}

// ─── FIA business name lookup (best-effort) ────────────────────────────────

const FIA_API_BASE = "https://eip.fia.gov.tw/OAI/api/businessRegistration";

// Batch-level cache — avoids redundant FIA lookups for the same tax ID
// within a single invocation (common: multiple invoices from the same seller).
// Cleared on each new Serve() invocation.
let businessNameCache = new Map<string, string | null>();

async function lookupBusinessName(taxId: string): Promise<string | null> {
  if (!/^\d{8}$/.test(taxId)) return null;
  if (businessNameCache.has(taxId)) return businessNameCache.get(taxId)!;
  try {
    const res = await fetch(`${FIA_API_BASE}/${taxId}`);
    if (!res.ok) { businessNameCache.set(taxId, null); return null; }
    const data = await res.json();
    const name = data?.businessNm || null;
    businessNameCache.set(taxId, name);
    return name;
  } catch {
    businessNameCache.set(taxId, null);
    return null;
  }
}

/**
 * Enrich extracted data with business names from FIA registry.
 * Skips lookup when taxId is missing/invalid, taxId confidence is "low",
 * or name confidence is already "high".
 */
async function enrichBusinessNames(
  data: Record<string, unknown>,
  parties: Array<{ nameField: string; taxIdField: string }>,
): Promise<void> {
  const confidence = (data.confidence ?? {}) as Record<string, string | undefined>;

  const lookups = parties.map(async (party) => {
    const taxId = data[party.taxIdField] as string | undefined;
    if (!taxId || !/^\d{8}$/.test(taxId)) return;

    const taxIdConf = confidence[party.taxIdField];
    if (taxIdConf === "low") return;

    const nameConf = confidence[party.nameField];
    if (nameConf === "high") return;

    const currentName = data[party.nameField] as string | undefined;
    if (currentName && !data.confidence) return;

    const name = await lookupBusinessName(taxId);
    if (name) {
      data[party.nameField] = name;
      confidence[party.nameField] = "high";
    }
  });

  await Promise.all(lookups);

  if (data.confidence) {
    data.confidence = confidence;
  }
}

// ─── Gemini API helpers ─────────────────────────────────────────────────────

function getGeminiApiUrl(): string {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

async function callGemini(
  payload: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(getGeminiApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const json: GeminiResponse = await response.json();
  if (!json.candidates || json.candidates.length === 0) {
    throw new Error("No candidates in Gemini response");
  }

  const text = json.candidates[0].content.parts[0].text;
  if (!text) throw new Error("No text content in Gemini response");
  return text;
}

function getMimeType(blobType: string, filename: string): string {
  const supportedTypes = [
    "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp",
  ];
  if (blobType && blobType !== "application/octet-stream" && supportedTypes.includes(blobType)) {
    return blobType;
  }
  const ext = filename.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg",
    jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  };
  if (ext === "heic" || ext === "heif") {
    throw new Error("HEIC/HEIF format is not supported by Gemini API.");
  }
  const detectedType = mimeTypes[ext || ""];
  if (!detectedType) throw new Error(`Unsupported file format: ${ext || "unknown"}`);
  return detectedType;
}

// ─── Invoice extraction ─────────────────────────────────────────────────────

async function extractInvoice(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string,
): Promise<void> {
  // Fetch invoice
  const { data: invoice, error: fetchErr } = await supabase
    .from("invoices").select("*").eq("id", invoiceId).single();
  if (fetchErr) throw fetchErr;
  if (!invoice) throw new Error("Invoice not found");

  // Fetch client info
  let clientInfo: ClientInfo = { name: "", taxId: "", industry: "" };
  if (invoice.client_id) {
    const { data: client } = await supabase
      .from("clients").select("name, tax_id, industry")
      .eq("id", invoice.client_id).single();
    if (client) {
      clientInfo = {
        name: client.name,
        taxId: client.tax_id || "",
        industry: client.industry || "",
      };
    }
  }

  const accountListString = invoice.in_or_out === "in" ? ACCOUNT_LIST.join("\n") : "";

  // Handle import-excel electronic invoices (account determination only)
  if (invoice.extracted_data) {
    const ed = invoice.extracted_data as Record<string, unknown>;
    if (ed.invoiceType === "電子發票" && ed.source === "import-excel") {
      console.log(`[invoice] ${invoiceId}: import-excel shortcut (${ed.inOrOut})`);
      let account: string;
      if (ed.inOrOut === "銷項") {
        account = "4101 營業收入";
      } else {
        // Call Gemini for account determination
        const t0 = Date.now();
        account = await determineAccount(
          (ed.summary as string) || "",
          clientInfo,
          accountListString,
        );
        console.log(`[invoice] ${invoiceId}: account determination took ${Date.now() - t0}ms`);
      }
      await saveInvoiceResult(supabase, invoiceId, { ...ed, account });
      return;
    }
  }

  // Download file from storage
  const dlStart = Date.now();
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("invoices").download(invoice.storage_path);
  if (dlErr) throw new Error(`Failed to download: ${dlErr.message}`);
  if (!fileData) throw new Error("Invoice file not found in storage");

  const arrayBuffer = await fileData.arrayBuffer();
  const fileSizeKB = Math.round(arrayBuffer.byteLength / 1024);
  console.log(`[invoice] ${invoiceId}: downloaded ${fileSizeKB}KB in ${Date.now() - dlStart}ms`);

  const base64Data = encodeBase64(arrayBuffer);
  const mimeType = getMimeType(fileData.type, invoice.filename);
  const inOrOut = invoice.in_or_out === "in" ? "進項" : "銷項";

  const prompt = buildInvoicePrompt(clientInfo, inOrOut, accountListString);
  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } },
      ],
    }],
    generationConfig: { response_mime_type: "application/json" },
  };

  const geminiStart = Date.now();
  const responseText = await callGemini(payload);
  console.log(`[invoice] ${invoiceId}: Gemini call took ${Date.now() - geminiStart}ms`);
  const extractedData = JSON.parse(responseText);

  // Normalize account string
  if (extractedData.account) {
    extractedData.account = extractedData.account
      .replace(/－/g, "-").replace(/：/g, ":");
  }

  await enrichBusinessNames(extractedData, [
    { nameField: "sellerName", taxIdField: "sellerTaxId" },
    { nameField: "buyerName", taxIdField: "buyerTaxId" },
  ]);

  await saveInvoiceResult(supabase, invoiceId, extractedData);
}

async function saveInvoiceResult(
  supabase: ReturnType<typeof createClient>,
  invoiceId: string,
  extractedData: Record<string, unknown>,
): Promise<void> {
  const updatePayload: Record<string, unknown> = {
    extracted_data: extractedData,
    status: "processed",
  };
  if (extractedData.invoiceSerialCode) {
    updatePayload.invoice_serial_code = extractedData.invoiceSerialCode;
  }

  const { error } = await supabase
    .from("invoices").update(updatePayload).eq("id", invoiceId);

  if (error) {
    // Handle duplicate invoice_serial_code (23505)
    if (error.code === "23505") {
      const { error: retryErr } = await supabase
        .from("invoices")
        .update({ extracted_data: extractedData, status: "processed" })
        .eq("id", invoiceId);
      if (retryErr) throw retryErr;
    } else {
      throw error;
    }
  }
}

async function determineAccount(
  summary: string,
  clientInfo: ClientInfo,
  accountListString: string,
): Promise<string> {
  const prompt = `You are an expert accounting assistant in Taiwan. Your task is to determine the most appropriate accounting account (會計科目) for an electronic invoice.

    Context:
    - **Client Industry**: "${clientInfo.industry}" (This is the industry of the buyer)
    - **Invoice Summary**: "${summary}" (This is what was purchased)

    Account List:
    ${accountListString}

    Rules:
    1. Select the most appropriate code from the **Account List** based on the summary and the client's industry.
    2. Return ONLY the "Code Name" (e.g., "5102 旅費").
    3. If you are unsure, pick the most generic but relevant one.
    4. Return ONLY the string of the account. No other text or explanation.`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { response_mime_type: "text/plain" },
  };

  const text = await callGemini(payload);
  return text.trim();
}

function buildInvoicePrompt(
  clientInfo: ClientInfo,
  inOrOut: "進項" | "銷項",
  accountListString: string,
): string {
  return `You are an expert data extraction assistant. Extract the following information from this Taiwan Unified Invoice (統一發票) image/PDF and return it as a pure JSON object.

    Context:
    - **Client Info**: Name: "${clientInfo.name}", Tax ID: "${clientInfo.taxId}", Industry: "${clientInfo.industry}".
    - **Source**: This file was found in the user's "${inOrOut}" (Input/Output) folder.
    - **Role Definition**:
      - Since Source is "**${inOrOut}**":
        - If Source is "進項" -> Client is the **Buyer**. You must find the Seller.
        - If Source is "銷項" -> Client is the **Seller**. You must find the Buyer.

    Account List (Only used if Source is "進項"):
    ${accountListString}

    Extraction Rules:
    1. **inOrOut**: Always return "${inOrOut}".
    2. **Buyer & Seller Identification**:
       - Based on the "Role Definition" above, map the Client's details to the correct field (Buyer or Seller).
       - Extract the *other* party's details from the invoice image.
       - **sellerName** / **sellerTaxId**: The entity issuing the invoice.
       - **buyerName** / **buyerTaxId**: The entity receiving the invoice.
    3. **invoiceSerialCode**: Must be 2 uppercase English letters followed by 8 digits (e.g., AB12345678). Watch out for OCR errors.
    4. **date**: Normalize to YYYY/MM/DD format. Convert ROC years (e.g., 113) to AD (e.g., 2024).
    5. **deductible**:
       - true ONLY if it is a domestic Taiwan invoice AND contains "稅" or "統一發票". Otherwise false.
    6. **Invoice Type-Specific Number Handling**:
       - For "手開二聯式" invoices:
         * There is NO separate tax field on the invoice
         * Set **totalSales** = **totalAmount** (the value shown is tax-inclusive)
         * Set **tax** = 0 (tax will be calculated separately later)
       - For "手開三聯式" and other invoice types with separate tax fields:
         * Extract **totalSales**, **tax**, and **totalAmount** as separate values from the invoice
         * Verify: totalSales + tax should equal totalAmount
    7. **Numbers**: Remove currency symbols/commas.
    8. **totalAmount**: Extract explicit "Total". Do NOT calculate.
    9. **summary**: A concise description (under 30 words) in Traditional Chinese (zh-TW).
    10. **account**:
        - If Source is "銷項": Set to "4101 營業收入".
        - If Source is "進項": Select the most appropriate code from the **Account List**. Return ONLY the "Code Name" (e.g., "5102 旅費").
    11. **taxType**:
        - Choose one of: "應稅", "零稅率", "免稅", or "作廢".
        - "應稅" if it has tax amount on it.
        - "零稅率" or "免稅" if the corresponding checkbox has been checked explicitly.
        - "作廢" if it's handwritten on the invoice.
    12. **invoiceType**: Select one of the following: "手開二聯式", "手開三聯式", "電子發票", "二聯式收銀機", "三聯式收銀機".
    13. **Confidence Scoring**:
        - For each extracted field, assign a confidence level: "low", "medium", or "high".
        - "high": The field is clearly visible and unambiguous.
        - "medium": The field is somewhat clear but might have minor issues (e.g., slight blur, unusual font).
        - "low": The field is unclear, handwritten and hard to read, or inferred.
        - Return a \`confidence\` object mapping field names to their confidence levels.

    Fields to extract:
    - inOrOut (string): "進項" or "銷項"
    - invoiceSerialCode (string)
    - date (string)
    - sellerName (string)
    - sellerTaxId (string)
    - buyerName (string)
    - buyerTaxId (string)
    - totalSales (number)
    - tax (number)
    - totalAmount (number)
    - deductible (boolean)
    - account (string)
    - summary (string)
    - taxType (string): One of "應稅", "零稅率", "免稅", "作廢"
    - invoiceType (string): One of "手開二聯式", "手開三聯式", "電子發票", "二聯式收銀機", "三聯式收銀機"
    - confidence (object): A map where keys are the field names above and values are "low", "medium", or "high".

    Return ONLY the raw JSON string. No markdown.`;
}

// ─── Allowance extraction ───────────────────────────────────────────────────

async function extractAllowance(
  supabase: ReturnType<typeof createClient>,
  allowanceId: string,
): Promise<void> {
  const { data: allowance, error: fetchErr } = await supabase
    .from("allowances").select("*").eq("id", allowanceId).single();
  if (fetchErr) throw fetchErr;
  if (!allowance) throw new Error("Allowance not found");

  let clientInfo: ClientInfo = { name: "", taxId: "", industry: "" };
  let clientTaxId = "";
  if (allowance.client_id) {
    const { data: client } = await supabase
      .from("clients").select("name, tax_id, industry")
      .eq("id", allowance.client_id).single();
    if (client) {
      clientInfo = {
        name: client.name,
        taxId: client.tax_id || "",
        industry: client.industry || "",
      };
      clientTaxId = client.tax_id || "";
    }
  }

  if (!allowance.storage_path) {
    throw new Error("Allowance storage path is missing");
  }

  const dlStart = Date.now();
  const { data: fileData, error: dlErr } = await supabase.storage
    .from("invoices").download(allowance.storage_path);
  if (dlErr) throw new Error(`Failed to download: ${dlErr.message}`);
  if (!fileData) throw new Error("Allowance file not found in storage");

  const arrayBuffer = await fileData.arrayBuffer();
  const fileSizeKB = Math.round(arrayBuffer.byteLength / 1024);
  console.log(`[allowance] ${allowanceId}: downloaded ${fileSizeKB}KB in ${Date.now() - dlStart}ms`);

  const base64Data = encodeBase64(arrayBuffer);
  const mimeType = getMimeType(fileData.type, allowance.filename || "");

  const prompt = buildAllowancePrompt(clientInfo);
  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64Data } },
      ],
    }],
    generationConfig: { response_mime_type: "application/json" },
  };

  const geminiStart = Date.now();
  const responseText = await callGemini(payload);
  console.log(`[allowance] ${allowanceId}: Gemini call took ${Date.now() - geminiStart}ms`);
  const extractedData = JSON.parse(responseText);

  // Add source
  extractedData.source = "scan";

  await enrichBusinessNames(extractedData, [
    { nameField: "sellerName", taxIdField: "sellerTaxId" },
    { nameField: "buyerName", taxIdField: "buyerTaxId" },
  ]);

  // Derive in_or_out from tax IDs
  let derivedInOrOut: string | undefined;
  if (clientTaxId) {
    if (extractedData.sellerTaxId === clientTaxId) derivedInOrOut = "out";
    else if (extractedData.buyerTaxId === clientTaxId) derivedInOrOut = "in";
  }
  const fallbackInOrOut = allowance.in_or_out === "in" ? "in" : "out";

  const { error } = await supabase
    .from("allowances")
    .update({
      extracted_data: extractedData,
      status: "processed",
      original_invoice_serial_code: extractedData.originalInvoiceSerialCode || null,
      in_or_out: derivedInOrOut ?? fallbackInOrOut,
    })
    .eq("id", allowanceId);

  if (error) throw error;
}

function buildAllowancePrompt(clientInfo: ClientInfo): string {
  return `You are an expert data extraction assistant. Extract the following information from this Taiwan allowance certificate (折讓證明單) image/PDF and return it as a pure JSON object.

    Context:
    - **Client Info**: Name: "${clientInfo.name}", Tax ID: "${clientInfo.taxId}", Industry: "${clientInfo.industry}".
    - This is a paper allowance document. Do NOT try to detect whether it is an invoice.

    Extraction Rules:
    1. **originalInvoiceSerialCode**: The original invoice number being referenced (2 uppercase letters + 8 digits).
    2. **allowanceType**: One of "三聯式折讓", "電子發票折讓", or "二聯式折讓".
    3. **amount**: The allowance amount (折讓金額).
    4. **taxAmount**: The tax amount (折讓稅額).
    5. **date**: Normalize to YYYY/MM/DD format. Convert ROC years (e.g., 113) to AD (e.g., 2024).
    6. **sellerName**, **sellerTaxId**, **buyerName**, **buyerTaxId**: Party info.
    7. **Numbers**: Remove currency symbols/commas.
    8. **Confidence Scoring**:
       - For each extracted field, assign a confidence level: "low", "medium", or "high".
       - "high": The field is clearly visible and unambiguous.
       - "medium": The field is somewhat clear but might have minor issues.
       - "low": The field is unclear, handwritten and hard to read, or inferred.
       - Return a \`confidence\` object mapping field names to their confidence levels.

    Fields to extract:
    - originalInvoiceSerialCode (string)
    - allowanceType (string): "三聯式折讓", "電子發票折讓", or "二聯式折讓"
    - amount (number)
    - taxAmount (number)
    - date (string)
    - sellerName (string)
    - sellerTaxId (string)
    - buyerName (string)
    - buyerTaxId (string)
    - confidence (object): Map field name -> "low" | "medium" | "high"

    Return ONLY the raw JSON string. No markdown.`;
}

// ─── Main handler ───────────────────────────────────────────────────────────

interface ProcessResult {
  success: boolean;
}

/**
 * Process a single queue message: extract data via Gemini, then archive or retry.
 */
async function processOneMessage(
  msg: PgmqMessage,
  supabase: ReturnType<typeof createClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue: any,
): Promise<ProcessResult> {
  const { entity_type, entity_id } = msg.message;
  const startTime = Date.now();
  console.log(`[process] Starting ${entity_type} ${entity_id} (attempt ${msg.read_ct}/${MAX_READ_COUNT})`);

  try {
    // Update entity status to processing (may already be processing from bulk enqueue)
    const table = entity_type === "invoice" ? "invoices" : "allowances";
    await supabase.from(table).update({ status: "processing" }).eq("id", entity_id);

    // Process based on entity type
    if (entity_type === "invoice") {
      await extractInvoice(supabase, entity_id);
    } else {
      await extractAllowance(supabase, entity_id);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[process] Completed ${entity_type} ${entity_id} in ${elapsed}ms`);

    // Success: archive the message
    await queue.rpc("archive", {
      queue_name: "extraction_jobs",
      message_id: msg.msg_id,
    });
    return { success: true };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[process] Failed ${entity_type} ${entity_id} after ${elapsed}ms:`, errorMessage);

    if (msg.read_ct >= MAX_READ_COUNT) {
      // Max retries exceeded — mark as failed and archive
      console.error(`[process] Max retries exceeded for ${entity_type} ${entity_id}, marking as failed`);
      const table = entity_type === "invoice" ? "invoices" : "allowances";
      await supabase.from(table).update({ status: "failed" }).eq("id", entity_id);

      await queue.rpc("archive", {
        queue_name: "extraction_jobs",
        message_id: msg.msg_id,
      });
    } else {
      console.log(
        `[process] Will retry ${entity_type} ${entity_id} (attempt ${msg.read_ct}/${MAX_READ_COUNT})`,
      );
    }
    return { success: false };
  }
}

Deno.serve(async (req) => {
  businessNameCache = new Map();
  const invocationStart = Date.now();
  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Read batch from pgmq queue
    const queue = supabase.schema("pgmq_public");
    const queueReadStart = Date.now();
    const { data: messages, error: readError } = await queue.rpc("read", {
      queue_name: "extraction_jobs",
      sleep_seconds: VISIBILITY_TIMEOUT,
      n: BATCH_SIZE,
    });

    if (readError) {
      console.error("[worker] Failed to read from queue:", readError);
      return new Response(
        JSON.stringify({ error: readError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, failed: 0, message: "No messages in queue" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const typedMessages = messages as PgmqMessage[];
    console.log(`[worker] Read ${typedMessages.length} messages from queue in ${Date.now() - queueReadStart}ms (batch=${BATCH_SIZE}, concurrency=${CONCURRENCY_LIMIT})`);

    let processed = 0;
    let failed = 0;

    // Process messages in parallel, chunked by CONCURRENCY_LIMIT
    for (let i = 0; i < typedMessages.length; i += CONCURRENCY_LIMIT) {
      const chunkIndex = Math.floor(i / CONCURRENCY_LIMIT) + 1;
      const totalChunks = Math.ceil(typedMessages.length / CONCURRENCY_LIMIT);
      const chunk = typedMessages.slice(i, i + CONCURRENCY_LIMIT);
      console.log(`[worker] Processing chunk ${chunkIndex}/${totalChunks} (${chunk.length} messages)`);

      const results = await Promise.allSettled(
        chunk.map((msg) => processOneMessage(msg, supabase, queue)),
      );

      for (const result of results) {
        if (result.status === "fulfilled" && result.value.success) {
          processed++;
        } else {
          failed++;
        }
      }
    }

    const totalElapsed = Date.now() - invocationStart;
    console.log(`[worker] Done: ${processed} processed, ${failed} failed, ${totalElapsed}ms total`);

    return new Response(
      JSON.stringify({ processed, failed, total: messages.length }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    const totalElapsed = Date.now() - invocationStart;
    console.error(`[worker] Unhandled error after ${totalElapsed}ms:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/hellow-world' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
