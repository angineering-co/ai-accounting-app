/**
 * Gemini Service for extracting invoice data
 * Adapted from examples/invoice-reader/src/GeminiService.ts
 */

import { type ExtractedInvoiceData, type ExtractedAllowanceData } from "@/lib/domain/models";

export interface ClientInfo {
  name: string;
  taxId: string;
  industry: string;
}

interface GeminiRequest {
  contents: Array<{
    parts: Array<{
      text?: string;
      inline_data?: {
        mime_type: string;
        data: string;
      };
    }>;
  }>;
  generationConfig: {
    response_mime_type: string;
  };
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

// Supported MIME types by Gemini API
// Note: HEIC/HEIF are not supported by Gemini API
// Users should convert HEIC files to JPEG or PNG before uploading
const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/**
 * Determine account (會計科目) for an electronic invoice based on summary and client industry
 * @param summary - Invoice summary
 * @param clientInfo - Client information (name, taxId, industry)
 * @param accountListString - Account list string for "進項" invoices
 * @returns Determined account name
 */
export async function determineAccountForInputElectronicInvoice(
  summary: string,
  clientInfo: ClientInfo,
  accountListString: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

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

  const payload: GeminiRequest = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "text/plain",
    },
  };

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
    }

    const jsonResponse: GeminiResponse = await response.json();

    if (!jsonResponse.candidates || jsonResponse.candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const contentText = jsonResponse.candidates[0].content.parts[0].text;

    if (!contentText) {
      throw new Error("No text content in Gemini response");
    }

    return contentText.trim();
  } catch (error) {
    console.error("Error determining account for electronic invoice:", error);
    throw new Error("Failed to determine account from Gemini API");
  }
}

/**
 * Extract invoice data using Gemini API
 * @param fileData - Invoice file as ArrayBuffer
 * @param mimeType - MIME type of the file (e.g., 'image/png', 'application/pdf')
 * @param clientInfo - Client information (name, taxId, industry)
 * @param inOrOut - Invoice type: "進項" or "銷項"
 * @param accountListString - Account list string for "進項" invoices
 * @returns Extracted invoice data
 */
export async function extractInvoiceData(
  fileData: ArrayBuffer,
  mimeType: string,
  clientInfo: ClientInfo,
  inOrOut: "進項" | "銷項",
  accountListString: string
): Promise<ExtractedInvoiceData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  // Validate MIME type is supported
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(
      `Unsupported MIME type: ${mimeType}. ` +
        `Supported types: ${SUPPORTED_MIME_TYPES.join(", ")}. ` +
        `For HEIC files, please convert to JPEG or PNG format.`
    );
  }

  // Convert ArrayBuffer to base64
  const base64Data = Buffer.from(fileData).toString("base64");

  // Build prompt based on examples/invoice-reader/src/GeminiService.ts
  const prompt = `You are an expert data extraction assistant. Extract the following information from this Taiwan Unified Invoice (統一發票) image/PDF and return it as a pure JSON object.

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

  const payload: GeminiRequest = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
    },
  };

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
    }

    const jsonResponse: GeminiResponse = await response.json();

    if (!jsonResponse.candidates || jsonResponse.candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const contentText = jsonResponse.candidates[0].content.parts[0].text;

    if (!contentText) {
      throw new Error("No text content in Gemini response");
    }

    // Parse the JSON response
    const extractedData = JSON.parse(contentText) as ExtractedInvoiceData;

    // Normalize account string (handle full-width dash/colon)
    if (extractedData.account) {
      extractedData.account = extractedData.account
        .replace(/－/g, "-")
        .replace(/：/g, ":") as ExtractedInvoiceData['account'];
    }

    return extractedData;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Error parsing Gemini JSON response:", error);
      throw new Error(
        "Failed to parse invoice data from Gemini response: Invalid JSON"
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to extract invoice data from Gemini API");
  }
}

/**
 * Extract allowance data using Gemini API (paper allowances only)
 * @param fileData - Allowance file as ArrayBuffer
 * @param mimeType - MIME type of the file (e.g., 'image/png', 'application/pdf')
 * @param clientInfo - Client information (name, taxId, industry)
 * @returns Extracted allowance data
 */
export async function extractAllowanceData(
  fileData: ArrayBuffer,
  mimeType: string,
  clientInfo: ClientInfo
): Promise<ExtractedAllowanceData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }

  // Validate MIME type is supported
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    throw new Error(
      `Unsupported MIME type: ${mimeType}. ` +
        `Supported types: ${SUPPORTED_MIME_TYPES.join(", ")}. ` +
        `For HEIC files, please convert to JPEG or PNG format.`
    );
  }

  // Convert ArrayBuffer to base64
  const base64Data = Buffer.from(fileData).toString("base64");

  const prompt = `You are an expert data extraction assistant. Extract the following information from this Taiwan allowance certificate (折讓證明單) image/PDF and return it as a pure JSON object.

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

  const payload: GeminiRequest = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
    },
  };

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
    }

    const jsonResponse: GeminiResponse = await response.json();

    if (!jsonResponse.candidates || jsonResponse.candidates.length === 0) {
      throw new Error("No candidates in Gemini response");
    }

    const contentText = jsonResponse.candidates[0].content.parts[0].text;

    if (!contentText) {
      throw new Error("No text content in Gemini response");
    }

    const extractedData = JSON.parse(contentText) as ExtractedAllowanceData;

    return extractedData;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Error parsing Gemini JSON response:", error);
      throw new Error(
        "Failed to parse allowance data from Gemini response: Invalid JSON"
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to extract allowance data from Gemini API");
  }
}
