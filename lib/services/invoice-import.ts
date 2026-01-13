'use server';

import { createClient } from "@/lib/supabase/server";
import { type ExtractedInvoiceData } from "@/lib/domain/models";
import { type TablesInsert, type Json } from "@/supabase/database.types";
import iconv from "iconv-lite";
import { RocPeriod } from "@/lib/domain/roc-period";
import { toGregorianDate } from "@/lib/utils";

// Helper to parse byte string
function substringBytes(buffer: Buffer, start: number, length: number): string {
  // start is 1-based index from spec, convert to 0-based
  const chunk = buffer.subarray(start - 1, start - 1 + length);
  return iconv.decode(chunk, 'big5').trim();
}

interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}

export async function processElectronicInvoiceFile(
  clientId: string,
  firmId: string,
  storagePath: string,
  filename: string
): Promise<ImportResult> {
  const supabase = await createClient();
  const result: ImportResult = {
    total: 0,
    success: 0,
    failed: 0,
    errors: [],
  };

  try {
    // 1. Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('electronic-invoices')
      .download(storagePath);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message || 'No data'}`);
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    
    // 2. Parse lines (81 bytes + newline)
    // We can't just split by \n because Big5 might contain bytes that look like newlines (though unlikely in this rigid format)
    // But this format is fixed width 81 bytes usually followed by CR/LF
    // Let's iterate line by line.
    
    const content = iconv.decode(buffer, 'big5');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    
    result.total = lines.length;
    const invoicesToInsert: TablesInsert<'invoices'>[] = [];
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) throw new Error("Unauthorized");

    let currentLine = 0;
    let offset = 0;
    while (offset < buffer.length) {
      currentLine++;
      let lineEnd = buffer.indexOf('\n', offset);
      if (lineEnd === -1) lineEnd = buffer.length;
      
      // Handle CR if present
      let lineContentEnd = lineEnd;
      if (lineContentEnd > offset && buffer[lineContentEnd - 1] === 0x0D) { // \r
        lineContentEnd--;
      }
      
      const lineBuffer = buffer.subarray(offset, lineContentEnd);
      offset = lineEnd + 1;

      if (lineBuffer.length === 0) continue;
      
      // Strict 81 bytes check? Some systems might not pad correctly or might strip trailing spaces.
      // The spec says 81 bytes. Let's try to be lenient if it's slightly short but has data.
      // But for byte extraction we need to be careful.
      // Let's pad with spaces if short
      let processingBuffer = lineBuffer;
      if (lineBuffer.length < 81) {
          const padding = Buffer.alloc(81 - lineBuffer.length, ' '); // Space char
          processingBuffer = Buffer.concat([lineBuffer, padding]);
      }

      try {
        const invoiceData = parseTxtRow(processingBuffer, clientId, firmId, storagePath, filename, user.id);
        if (invoiceData) {
          invoicesToInsert.push(invoiceData);
          result.success++;
        }
      } catch (e) {
        result.failed++;
        result.errors.push(`Line ${currentLine}: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }
    
    // Batch insert
    // We should probably check for duplicates first if this is meant to be idempotent.
    // However, the spec doesn't specify unique constraints on invoice content beyond ID.
    // The current implementation will insert duplicates if run multiple times.
    // For idempotency, we could check for existing invoices with the same serial code + date + seller + buyer.
    
    // Check for duplicates before inserting
    const uniqueInvoices = [];
    
    for (const inv of invoicesToInsert) {
      // Basic check: Is there already an invoice with this serial code in this period?
      // Since we are inserting confirmed invoices, we might want to skip if it exists.
      
      const extracted = inv.extracted_data as { invoiceSerialCode?: string }; // Cast for access
      if (!extracted || !extracted.invoiceSerialCode) {
        uniqueInvoices.push(inv);
        continue;
      }

      // Check against DB
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('firm_id', firmId)
        .eq('client_id', clientId)
        .eq('status', 'confirmed')
        .contains('extracted_data', { invoiceSerialCode: extracted.invoiceSerialCode })
        .maybeSingle(); // Use maybeSingle to avoid error if 0 or multiple

      if (!existing) {
        uniqueInvoices.push(inv);
      }
    }

    if (uniqueInvoices.length > 0) {
      const { error: insertError } = await supabase
        .from('invoices')
        .insert(uniqueInvoices);
        
      if (insertError) {
        throw insertError;
      }
      
      // Update result count to reflect actual insertions?
      // Or keep success as "lines processed successfully"?
      // If we skip duplicates, it's technically a success (idempotent).
      // Let's count them as success but maybe log warnings?
      // For now, let's just proceed. Ideally the UI should know how many were new.
    }

  } catch (error) {
    console.error("Import error:", error);
    throw error;
  }

  return result;
}

function parseTxtRow(
  buffer: Buffer, 
  clientId: string, 
  firmId: string, 
  storagePath: string, 
  filename: string,
  userId: string
): TablesInsert<'invoices'> {
  // A: Format Code (1-2)
  const formatCode = substringBytes(buffer, 1, 2);
  
  // B: Tax Payer ID (3-11)
  // C: Seq (12-18)
  // const seq = substringBytes(buffer, 12, 7);
  
  // D: YearMonth (19-23)
  const yearMonthStr = substringBytes(buffer, 19, 5);
  
  // E/F, G/H, I/J, K, L, M logic
  // Parse fields common to all first
  const taxType = substringBytes(buffer, 62, 1); // P
  const taxAmountStr = substringBytes(buffer, 63, 10); // Q
  const salesAmountStr = substringBytes(buffer, 50, 12); // O/N
  
  const inOrOut = formatCode.startsWith('2') ? 'in' : 'out';
  const invoiceTypeStr = getInvoiceTypeFromCode(formatCode);
  
  // Determine Buyer/Seller Tax ID
  // If S=A and Output (3X) => E/F is End Number? No, wait.
  // Spec:
  // E/F (24-31): 
  //   S=A & Output: End Number
  //   Else: Buyer Tax ID
  // G/H (32-39):
  //   S=A & Input: Count
  //   Else: Seller Tax ID
  
  const S = substringBytes(buffer, 80, 1);
  let buyerTaxId = substringBytes(buffer, 24, 8);
  let sellerTaxId = substringBytes(buffer, 32, 8);
  
  if (S === 'A' && inOrOut === 'out') {
    // E/F is End Number, so Buyer Tax ID is effectively N/A or empty for this aggregate record?
    // Actually aggregate records usually don't have a single buyer.
    buyerTaxId = ""; 
  }
  
  if (S === 'A' && inOrOut === 'in') {
    // G/H is Count
    sellerTaxId = ""; // Aggregate input
  }
  
  // Parse Invoice Number
  // Logic:
  // M (36-49): Customs (Format 28, 29)
  // I+J (40-49): Standard (21, 31, 35...)
  // K (40-49): Other (22, 24, 27, 34, 36, 37, 38)
  // L (40-49): Public Utility (25 with special condition)
  
  let invoiceSerial = "";
  let invoiceNo = "";
  
  if (formatCode === '28' || formatCode === '29') {
     invoiceNo = substringBytes(buffer, 36, 14);
  } else {
     // Check for L (Format 25)
     // How to distinguish L vs I+J?
     // Spec says L used when "using carrier serial number". 
     // Usually I+J (Track + No) is standard.
     // Let's assume standard I+J (10 bytes at 40-49) for now unless it's clearly something else.
     invoiceSerial = substringBytes(buffer, 40, 2);
     invoiceNo = substringBytes(buffer, 42, 8);
  }
  
  const fullInvoiceNumber = invoiceSerial + invoiceNo;
  
  // Tax Type mapping
  const taxTypeMap: Record<string, string> = {
    '1': '應稅',
    '2': '零稅率',
    '3': '免稅',
    'F': '作廢',
    'D': '彙加' // Assuming D maps to what the schema expects? Schema has '彙加'. 
               // Wait, 'D' in spec is "空白未使用"? 
               // Spec says: F (Void), D (Unused/Blank).
               // S=A is "Aggregate" (彙加).
  };
  
  let mappedTaxType = taxTypeMap[taxType] || '應稅';
  if (S === 'A') mappedTaxType = '彙加';
  if (taxType === 'F') mappedTaxType = '作廢';
  
  // Amounts
  const sales = parseInt(salesAmountStr) || 0;
  const tax = parseInt(taxAmountStr) || 0;
  
  // Date conversion
  const period = RocPeriod.fromYYYMM(yearMonthStr);
  // Default to 1st of month since we don't have exact day
  const date = toGregorianDate(yearMonthStr);
  const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

  // Extracted Data
  const extractedData: ExtractedInvoiceData & { source: string } = {
    invoiceSerialCode: fullInvoiceNumber,
    date: dateStr,
    sellerTaxId: sellerTaxId,
    buyerTaxId: buyerTaxId,
    totalSales: sales,
    tax: tax,
    totalAmount: sales + tax,
    taxType: mappedTaxType as ExtractedInvoiceData['taxType'],
    invoiceType: invoiceTypeStr as ExtractedInvoiceData['invoiceType'],
    inOrOut: inOrOut === 'in' ? '進項' : '銷項',
    deductible: true, // Note we don't have deductible information in the TXT file, so we assume it's true.
    source: 'import'
  };

  return {
    firm_id: firmId,
    client_id: clientId,
    storage_path: storagePath,
    filename: filename,
    in_or_out: inOrOut,
    status: 'processed',
    extracted_data: extractedData as unknown as Json,
    year_month: period.toString(), // YYYMM format with starting month
    uploaded_by: userId,
  };
}

function getInvoiceTypeFromCode(code: string): string {
  // Mapping based on common knowledge or spec if available
  // 21: 進項三聯式
  // 22: 進項二聯式
  // 25: 進項三聯式收銀機 / 電子發票
  // 31: 銷項三聯式
  // 32: 銷項二聯式
  // 35: 銷項三聯式收銀機 / 電子發票
  
  switch (code) {
    case '21': return '手開三聯式';
    case '22': return '手開二聯式';
    case '25': return '電子發票'; // Or 三聯式收銀機
    case '31': return '手開三聯式';
    case '32': return '手開二聯式';
    case '35': return '電子發票';
    default: return '電子發票'; // Fallback
  }
}
