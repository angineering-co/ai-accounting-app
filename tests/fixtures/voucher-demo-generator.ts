import type { Document } from "@/lib/domain/document";
import type {
  JournalEntry,
  JournalEntryLine,
} from "@/lib/domain/journal-entry";
import type { AuditTrail } from "@/lib/domain/audit-trail";

export interface VoucherDemoData {
  firmId: string;
  clientId: string;
  userId: string;
  entries: JournalEntry[];
  lines: JournalEntryLine[];
  documents: Document[];
  auditTrails: AuditTrail[];
}

// Phase 1 fake data: covers every UI state phase 2 must render.
// IDs are deterministic counter-based UUIDs so tests can assert exact shapes.
export interface GenerateVoucherDemoDataOptions {
  firmId?: string;
  clientId?: string;
}

export function generateVoucherDemoData(
  opts: GenerateVoucherDemoDataOptions = {},
): VoucherDemoData {
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
  };

  const firmId = opts.firmId ?? nextId();
  const clientId = opts.clientId ?? nextId();
  const userId = nextId();

  const documents: Document[] = [];
  const entries: JournalEntry[] = [];
  const lines: JournalEntryLine[] = [];
  const auditTrails: AuditTrail[] = [];

  const at = (iso: string): Date => new Date(iso);

  // ---------- Documents (one per VAT-source entry; none for system entries) ----------

  // doc1：進項發票 文具 3,300（→ entry1，posted 無編輯）
  const doc1Id = nextId();
  documents.push({
    id: doc1Id,
    firm_id: firmId,
    client_id: clientId,
    doc_date: "2024-01-15",
    type: "VAT",
    doc_type: "invoice",
    file_url: "demo/invoices/2024-01-15-stationery.pdf",
    ocr_status: "done",
    amount: 3300,
    duplicate_of: null,
    status: "active",
    created_by: userId,
    created_at: at("2024-01-15T09:00:00Z"),
    updated_at: at("2024-01-15T09:00:00Z"),
  });

  // doc2：進項發票 旅費 12,600（→ entry2，posted-edited）
  const doc2Id = nextId();
  documents.push({
    id: doc2Id,
    firm_id: firmId,
    client_id: clientId,
    doc_date: "2024-01-20",
    type: "VAT",
    doc_type: "invoice",
    file_url: "demo/invoices/2024-01-20-travel.pdf",
    ocr_status: "done",
    amount: 12600,
    duplicate_of: null,
    status: "active",
    created_by: userId,
    created_at: at("2024-01-20T09:00:00Z"),
    updated_at: at("2024-01-22T15:30:00Z"),
  });

  // doc3：進項折讓 1,050（→ entry3，posted）
  const doc3Id = nextId();
  documents.push({
    id: doc3Id,
    firm_id: firmId,
    client_id: clientId,
    doc_date: "2024-02-05",
    type: "VAT",
    doc_type: "allowance",
    file_url: "demo/allowances/2024-02-05.pdf",
    ocr_status: "done",
    amount: 1050,
    duplicate_of: null,
    status: "active",
    created_by: userId,
    created_at: at("2024-02-05T10:00:00Z"),
    updated_at: at("2024-02-05T10:00:00Z"),
  });

  // doc4：銷項發票 21,000（→ entry4，後被沖銷）
  const doc4Id = nextId();
  documents.push({
    id: doc4Id,
    firm_id: firmId,
    client_id: clientId,
    doc_date: "2024-02-10",
    type: "VAT",
    doc_type: "invoice",
    file_url: "demo/invoices/2024-02-10-sales.pdf",
    ocr_status: "done",
    amount: 21000,
    duplicate_of: null,
    status: "active",
    created_by: userId,
    created_at: at("2024-02-10T11:00:00Z"),
    updated_at: at("2024-02-10T11:00:00Z"),
  });

  // doc5：進項發票 5,250（→ draft1）
  const doc5Id = nextId();
  documents.push({
    id: doc5Id,
    firm_id: firmId,
    client_id: clientId,
    doc_date: "2024-03-01",
    type: "VAT",
    doc_type: "invoice",
    file_url: "demo/invoices/2024-03-01-supplies.pdf",
    ocr_status: "done",
    amount: 5250,
    duplicate_of: null,
    status: "active",
    created_by: userId,
    created_at: at("2024-03-01T08:30:00Z"),
    updated_at: at("2024-03-01T08:30:00Z"),
  });

  // doc6：進項發票 1,050（→ draft3，缺科目）
  const doc6Id = nextId();
  documents.push({
    id: doc6Id,
    firm_id: firmId,
    client_id: clientId,
    doc_date: "2024-03-05",
    type: "VAT",
    doc_type: "invoice",
    file_url: "demo/invoices/2024-03-05-misc.pdf",
    ocr_status: "done",
    amount: 1050,
    duplicate_of: null,
    status: "active",
    created_by: userId,
    created_at: at("2024-03-05T14:00:00Z"),
    updated_at: at("2024-03-05T14:00:00Z"),
  });

  // ---------- Helper to build a line ----------
  const makeLine = (args: {
    journal_entry_id: string;
    line_number: number;
    account_code: string;
    debit?: number;
    credit?: number;
    description?: string;
  }): JournalEntryLine => ({
    id: nextId(),
    journal_entry_id: args.journal_entry_id,
    line_number: args.line_number,
    account_code: args.account_code,
    debit: args.debit ?? 0,
    credit: args.credit ?? 0,
    description: args.description ?? null,
  });

  // ---------- Entry 1: posted, 進項可扣抵, doc1 ----------
  const entry1Id = nextId();
  entries.push({
    id: entry1Id,
    firm_id: firmId,
    client_id: clientId,
    document_id: doc1Id,
    voucher_no: "20240115-00001",
    voucher_type: "支出",
    entry_date: "2024-01-15",
    description: "誠品書店 文具用品採購：A4 影印紙、原子筆、便利貼一批，共 3,300 元（含稅）",
    status: "posted",
    reverses_entry_id: null,
    posted_at: at("2024-01-16T10:00:00Z"),
    posted_by: userId,
    created_by: userId,
    created_at: at("2024-01-15T09:00:00Z"),
    updated_at: at("2024-01-16T10:00:00Z"),
  });
  lines.push(
    makeLine({ journal_entry_id: entry1Id, line_number: 1, account_code: "6133", debit: 3000, description: "文具用品費" }),
    makeLine({ journal_entry_id: entry1Id, line_number: 2, account_code: "1147", debit: 300, description: "進項稅額" }),
    makeLine({ journal_entry_id: entry1Id, line_number: 3, account_code: "1111", credit: 3300, description: "現金" }),
  );

  // ---------- Entry 2: posted-edited, 進項可扣抵, doc2 ----------
  // 模擬：原始 OCR 抓錯科目（5102 旅費 → 6133 文具用品費），員工 in-place edit 修正
  const entry2Id = nextId();
  entries.push({
    id: entry2Id,
    firm_id: firmId,
    client_id: clientId,
    document_id: doc2Id,
    voucher_no: "20240120-00001",
    voucher_type: "支出",
    entry_date: "2024-01-20",
    description: "王經理 1/18–1/19 台北↔台中出差：高鐵票、計程車、住宿，共 12,600 元（含稅）",
    status: "posted",
    reverses_entry_id: null,
    posted_at: at("2024-01-21T11:00:00Z"),
    posted_by: userId,
    created_by: userId,
    created_at: at("2024-01-20T09:00:00Z"),
    updated_at: at("2024-01-22T15:30:00Z"), // 編輯時間
  });
  lines.push(
    makeLine({ journal_entry_id: entry2Id, line_number: 1, account_code: "5102", debit: 12000, description: "旅費" }),
    makeLine({ journal_entry_id: entry2Id, line_number: 2, account_code: "1147", debit: 600, description: "進項稅額" }),
    makeLine({ journal_entry_id: entry2Id, line_number: 3, account_code: "1112", credit: 12600, description: "銀行存款" }),
  );
  // audit_trails 紀錄編輯前的 snapshot
  auditTrails.push({
    id: nextId(),
    firm_id: firmId,
    entity_table: "journal_entries",
    entity_id: entry2Id,
    action: "updated",
    before: {
      entry: {
        description: "出差旅費 12,600（OCR 誤抓為文具用品費，後修正）",
      },
      lines: [
        { line_number: 1, account_code: "6133", debit: 12000, credit: 0, description: "文具用品費（OCR 誤判）" },
        { line_number: 2, account_code: "1147", debit: 600, credit: 0, description: "進項稅額" },
        { line_number: 3, account_code: "1112", debit: 0, credit: 12600, description: "銀行存款" },
      ],
    },
    reason: "OCR 將旅費誤判為文具用品費，依實際發票內容修正",
    actor_id: userId,
    actor_at: at("2024-01-22T15:30:00Z"),
  });

  // ---------- Entry 3: posted, 進項折讓, doc3 ----------
  const entry3Id = nextId();
  entries.push({
    id: entry3Id,
    firm_id: firmId,
    client_id: clientId,
    document_id: doc3Id,
    voucher_no: "20240205-00001",
    voucher_type: "收入",
    entry_date: "2024-02-05",
    description: "誠品書店 進項折讓：1/15 文具用品退貨一批，折讓金額 1,050 元（含稅）",
    status: "posted",
    reverses_entry_id: null,
    posted_at: at("2024-02-06T09:00:00Z"),
    posted_by: userId,
    created_by: userId,
    created_at: at("2024-02-05T10:00:00Z"),
    updated_at: at("2024-02-06T09:00:00Z"),
  });
  lines.push(
    makeLine({ journal_entry_id: entry3Id, line_number: 1, account_code: "1111", debit: 1050, description: "現金" }),
    makeLine({ journal_entry_id: entry3Id, line_number: 2, account_code: "6133", credit: 1000, description: "文具用品費（折讓）" }),
    makeLine({ journal_entry_id: entry3Id, line_number: 3, account_code: "1147", credit: 50, description: "進項稅額（折讓）" }),
  );

  // ---------- Entry 4: 原本 posted, 後被沖銷, doc4 ----------
  const entry4Id = nextId();
  entries.push({
    id: entry4Id,
    firm_id: firmId,
    client_id: clientId,
    document_id: doc4Id,
    voucher_no: "20240210-00001",
    voucher_type: "收入",
    entry_date: "2024-02-10",
    description: "ABC 顧問公司 軟體授權銷售：5 套年度方案，含 5% 營業稅共 21,000 元（已沖銷）",
    status: "reversed",
    reverses_entry_id: null,
    posted_at: at("2024-02-11T10:00:00Z"),
    posted_by: userId,
    created_by: userId,
    created_at: at("2024-02-10T11:00:00Z"),
    updated_at: at("2024-02-15T16:00:00Z"),
  });
  lines.push(
    makeLine({ journal_entry_id: entry4Id, line_number: 1, account_code: "1112", debit: 21000, description: "銀行存款" }),
    makeLine({ journal_entry_id: entry4Id, line_number: 2, account_code: "4101", credit: 20000, description: "營業收入" }),
    makeLine({ journal_entry_id: entry4Id, line_number: 3, account_code: "2271", credit: 1000, description: "銷項稅額" }),
  );

  // ---------- Entry 5: 反向分錄（沖銷 entry4），posted, no document ----------
  const entry5Id = nextId();
  entries.push({
    id: entry5Id,
    firm_id: firmId,
    client_id: clientId,
    document_id: null,
    voucher_no: "20240215-00001",
    voucher_type: "轉帳",
    entry_date: "2024-02-15",
    description: "沖銷 20240210-00001：ABC 顧問公司 2/15 來函取消訂單，全額退款已執行",
    status: "posted",
    reverses_entry_id: entry4Id,
    posted_at: at("2024-02-15T16:00:00Z"),
    posted_by: userId,
    created_by: userId,
    created_at: at("2024-02-15T16:00:00Z"),
    updated_at: at("2024-02-15T16:00:00Z"),
  });
  lines.push(
    makeLine({ journal_entry_id: entry5Id, line_number: 1, account_code: "4101", debit: 20000, description: "營業收入（沖銷）" }),
    makeLine({ journal_entry_id: entry5Id, line_number: 2, account_code: "2271", debit: 1000, description: "銷項稅額（沖銷）" }),
    makeLine({ journal_entry_id: entry5Id, line_number: 3, account_code: "1112", credit: 21000, description: "銀行存款（沖銷）" }),
  );
  // audit_trails 紀錄 entry4 被沖銷
  auditTrails.push({
    id: nextId(),
    firm_id: firmId,
    entity_table: "journal_entries",
    entity_id: entry4Id,
    action: "reversed",
    before: null,
    reason: "客戶取消訂單，全額沖銷",
    actor_id: userId,
    actor_at: at("2024-02-15T16:00:00Z"),
  });

  // ---------- Entry 6: 系統分錄（折舊），posted, no document ----------
  const entry6Id = nextId();
  entries.push({
    id: entry6Id,
    firm_id: firmId,
    client_id: clientId,
    document_id: null,
    voucher_no: "20240228-00001",
    voucher_type: "轉帳",
    entry_date: "2024-02-28",
    description: "二月份折舊（系統自動入帳）：辦公設備 + 電腦設備，依直線法分攤計提 5,000 元",
    status: "posted",
    reverses_entry_id: null,
    posted_at: at("2024-02-28T23:59:00Z"),
    posted_by: null,
    created_by: null,
    created_at: at("2024-02-28T23:59:00Z"),
    updated_at: at("2024-02-28T23:59:00Z"),
  });
  lines.push(
    makeLine({ journal_entry_id: entry6Id, line_number: 1, account_code: "6173", debit: 5000, description: "折舊費用" }),
    makeLine({ journal_entry_id: entry6Id, line_number: 2, account_code: "1611", credit: 5000, description: "累計折舊" }),
  );

  // ---------- Draft 1: balanced, ready to post（doc5）----------
  const draft1Id = nextId();
  entries.push({
    id: draft1Id,
    firm_id: firmId,
    client_id: clientId,
    document_id: doc5Id,
    voucher_no: null,
    voucher_type: "支出",
    entry_date: "2024-03-01",
    description: "聯強國際 辦公用品採購：影印紙 10 包、墨水匣 3 組、雜項，共 5,250 元（含稅）",
    status: "draft",
    reverses_entry_id: null,
    posted_at: null,
    posted_by: null,
    created_by: userId,
    created_at: at("2024-03-01T08:30:00Z"),
    updated_at: at("2024-03-01T08:30:00Z"),
  });
  lines.push(
    makeLine({ journal_entry_id: draft1Id, line_number: 1, account_code: "6133", debit: 5000, description: "文具用品費" }),
    makeLine({ journal_entry_id: draft1Id, line_number: 2, account_code: "1147", debit: 250, description: "進項稅額" }),
    makeLine({ journal_entry_id: draft1Id, line_number: 3, account_code: "1112", credit: 5250, description: "銀行存款" }),
  );

  // ---------- Draft 2: balanced, manual entry, no document ----------
  const draft2Id = nextId();
  entries.push({
    id: draft2Id,
    firm_id: firmId,
    client_id: clientId,
    document_id: null,
    voucher_no: null,
    voucher_type: "收入",
    entry_date: "2024-03-03",
    description: "3/3 現金銷貨：店面零售收入，無開立發票，含 5% 營業稅共 8,400 元（手動建單）",
    status: "draft",
    reverses_entry_id: null,
    posted_at: null,
    posted_by: null,
    created_by: userId,
    created_at: at("2024-03-03T17:00:00Z"),
    updated_at: at("2024-03-03T17:00:00Z"),
  });
  lines.push(
    makeLine({ journal_entry_id: draft2Id, line_number: 1, account_code: "1111", debit: 8400, description: "現金" }),
    makeLine({ journal_entry_id: draft2Id, line_number: 2, account_code: "4101", credit: 8000, description: "營業收入" }),
    makeLine({ journal_entry_id: draft2Id, line_number: 3, account_code: "2271", credit: 400, description: "銷項稅額" }),
  );

  // ---------- Draft 3: 缺科目（無法 post）（doc6）----------
  // 用 line_number=1 的 description 標示 "（待補科目）" 但 account_code 為佔位 "9999"
  const draft3Id = nextId();
  entries.push({
    id: draft3Id,
    firm_id: firmId,
    client_id: clientId,
    document_id: doc6Id,
    voucher_no: null,
    voucher_type: "支出",
    entry_date: "2024-03-05",
    description: "雜支 1,050 元（科目待補）：請會計師確認此筆應歸入文具用品費或雜項費用",
    status: "draft",
    reverses_entry_id: null,
    posted_at: null,
    posted_by: null,
    created_by: userId,
    created_at: at("2024-03-05T14:00:00Z"),
    updated_at: at("2024-03-05T14:00:00Z"),
  });
  lines.push(
    makeLine({ journal_entry_id: draft3Id, line_number: 1, account_code: "9999", debit: 1000, description: "（待補科目）" }),
    makeLine({ journal_entry_id: draft3Id, line_number: 2, account_code: "1147", debit: 50, description: "進項稅額" }),
    makeLine({ journal_entry_id: draft3Id, line_number: 3, account_code: "1111", credit: 1050, description: "現金" }),
  );

  return {
    firmId,
    clientId,
    userId,
    entries,
    lines,
    documents,
    auditTrails,
  };
}
