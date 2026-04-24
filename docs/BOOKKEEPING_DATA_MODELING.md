# SnapBooks 記帳資料模型設計總結

> 這份文件整理了「憑證 / 傳票 / 分錄 / 分錄明細」四層會計概念的澄清、最終的資料模型決策、以及完整的情境 illustration，作為後續 tech design refinement 的基礎。

---

## 一、核心概念與中英對照

### 四層會計概念

| Layer | 中文 | 英文 | 角色 |
|---|---|---|---|
| 1 | **憑證**（原始憑證） | **Source Document / Document** | 交易的原始證明文件 |
| 2 | **傳票**（記帳憑證） | **Voucher / Journal Voucher** | 根據憑證整理出的記帳單，分收入/支出/轉帳 |
| 3 | **分錄** | **Journal Entry** | 傳票裡實際的借貸會計動作（借貸相等） |
| 4 | **分錄明細** | **Journal Entry Line** | 分錄裡的每一行借方或貸方項目 |

### 憑證（Documents）的類型

> 「憑證」是上位概念，**發票只是憑證的一種**，其他還包含收據、保單、薪資單、合約、銀行水單等。

| doc_type | 說明 | 範例 |
|---|---|---|
| `invoice` | 統一發票 | 三聯式/二聯式發票 |
| `allowance` | 折讓單 | 銷貨退回折讓證明 |
| `receipt` | 收據 | 水電費收據、租金收據 |
| `insurance` | 保單 | 產險、壽險保單 |
| `payroll` | 薪資單 | 員工薪資計算表 |
| `contract` | 合約 | 買賣/租賃合約 |
| ... | 未來擴充 | |

### 命名的重要澄清 ⚠️

在國際會計/ERP 語境中：
- **`voucher` = 傳票（記帳憑證）**，不是原始憑證
- **`document` / `source document` = 原始憑證**

因此**不要**把存放發票、收據的表命名為 `vouchers`——會和國際慣例（SAP、Oracle、Odoo、QuickBooks）衝突造成嚴重誤解。

---

## 二、關鍵設計決策

### 決策 1：「傳票」不做獨立 entity，壓平進 `journal_entries`

**理由：**
- 既然規則上是「一張傳票 ↔ 一個分錄」嚴格 1:1，多一張表純屬冗餘
- `voucher_no`、`voucher_type` 本質上就是分錄的兩個欄位
- 紙本時代傳票是物理文件，數位時代沒必要保留這層
- 和國際 ERP 慣例一致（Odoo、QuickBooks 也是這樣做）

**實作：**
- 資料庫只有 `journal_entries`，沒有 `vouchers` 表
- UI 層仍以「傳票」樣式呈現（同一份資料的不同 view）
- `voucher_no` 和 `voucher_type` 依然存在 DB，因為列印、搜尋、匯出都需要

### 決策 2：憑證和分錄規則上是嚴格 1:1（允許憑證端為 NULL）

**規則：**
- 客戶上傳的每一張憑證 **只對應一筆分錄**
- 要教育用戶「每張發票單獨上傳」，不要把多張合拍一張
- 系統生成的分錄（折舊、攤提、調整、沖銷）可以 `document_id = NULL`

**這帶來的設計簡化：**
- Schema 線性、無 N:N 關聯表
- AI 辨識邏輯簡化（一張一張處理）
- UI 心智模型直觀（上傳一張憑證 = 記一筆帳）

### 決策 3：`invoices` 和 `allowances` 作為 `documents` 的子表（Class Table Inheritance）

**理由：**
- 既有的 `invoices` 和 `allowances` 表已有成熟 schema（歷史脈絡上先有了這兩張表）
- 通用欄位（file_url, doc_date, amount, status）抽到 `documents`
- 特殊欄位（buyer_ubn, invoice_no, tax_amount / related_invoice_no, allowance_reason）保留在子表
- 未來新增類型（receipts、payroll）只需再加子表 (TBD - 子表型態眾多，也可能直接放在 documents 表上)

### 決策 4：「沖銷」記錄在分錄層級，不在憑證層級

**核心原則：沖銷沖的是「帳」，不是「單據」。**

| 層 | 關心什麼 | 不關心什麼 |
|---|---|---|
| `documents` | 文件事實、重複、作廢、軟刪除 | 會計動作、借貸、沖銷 |
| `journal_entries` | 記帳動作、借貸、沖銷、審核狀態 | 文件長怎樣 |

**實作：**
- `journal_entries.reverses_entry_id` 自參照 FK（指向被沖銷的分錄）
- `journal_entries.reversal_reason` 沖銷原因
- `documents` 表**沒有**沖銷欄位，只有 `status` 表達文件本身狀態

### 決策 5：業務關聯 vs 會計關聯分兩條獨立路徑

**兩條平行但獨立的關聯：**

```
業務關聯：allowances.original_invoice_id → invoices.id
會計關聯：journal_entries.reverses_entry_id → journal_entries.id
```

- **業務關聯**處理文件之間的引用（折讓單指向被折讓的發票）
- **會計關聯**處理分錄之間的沖銷（新分錄撤銷舊分錄）
- 兩者不重疊、不混用，未來查詢更清晰

### 決策 6：Draft / Posted 狀態機與 voucher_no 賦號時機

- `voucher_type` **NOT NULL**（每筆分錄都屬於某類型）
- `voucher_no` **NULL allowed**，只有 draft 階段能為 NULL
- 賦號時機：`draft → posted` transition 時才賦號
- 理由：會計上傳票號不可跳號，draft 刪除不能造成缺號

### 決策 7：Documents status 值域

| 狀態 | 語意 | 何時使用 |
|---|---|---|
| `active` | 正常有效的憑證，會列入申報 | 預設（發票、折讓單都是） |
| `duplicate` | 重複上傳，不該記帳 | 系統偵測 invoice_no 重複 |
| `void` | 發票被作廢（**同期內**作廢，視同未開立） | 自開銷項發票當月作廢 |
| `deleted` | 軟刪除 | 使用者誤上傳要移除 |

**重要區別：「發票作廢」≠「開立折讓」**

| 處理方式 | 法律意義 | 文件狀態 |
|---|---|---|
| 發票作廢 | 該發票從未發生，視同未開立 | 原發票 → `void` |
| 開立折讓 | 原發票仍有效，另開折讓單沖抵 | 原發票 `active`、折讓單 `active` |

**跨期錯誤一律走折讓，不走 void。**

---

## 三、Entity Relationship

### 關係圖

```
                    ┌─────────────────────┐
                    │     documents       │  ← 原始憑證（共通層）
                    │ (doc_type 判別類型) │
                    └──────────┬──────────┘
                               │ 1:1（CTI 繼承）
               ┌───────────────┼───────────────┬──────────────┐
               │               │               │              │
               ▼               ▼               ▼              ▼
          ┌─────────┐    ┌──────────┐    ┌─────────┐    ┌──────────┐
          │invoices │    │allowances│    │receipts │    │ payroll  │
          │ （現有）│    │ （現有） │    │ (未來)  │    │  (未來)  │
          └─────────┘    └──────────┘    └─────────┘    └──────────┘

   documents ──(1:1, document 端 optional)── journal_entries ──(1:N)── journal_entry_lines
                                                    │
                                                    │ reverses_entry_id (self FK)
                                                    ▼
                                              journal_entries
```

### Cardinality 一覽

| 關係 | 基數 | 備註 |
|---|---|---|
| documents ↔ invoices | 1:1 | `doc_type='invoice'` 時必有對應 invoices row |
| documents ↔ allowances | 1:1 | `doc_type='allowance'` 時必有對應 allowances row |
| documents ↔ journal_entries | 1:1，document 端可 NULL | 折舊/攤提/沖銷等系統分錄無 document |
| journal_entries → journal_entry_lines | 1:N（≥2） | 借貸必須平衡 |
| journal_entries → journal_entries (reverses) | N:1，self FK，nullable | 沖銷關係 |
| allowances → invoices (original_invoice_id) | N:1 | 業務關聯 |

---

## 四、Schema Sketch

```sql
-- 共通層：所有原始憑證
documents (
  id                UUID PK,
  doc_type          TEXT NOT NULL,      -- 'invoice' | 'allowance' | 'receipt' | 'payroll' | ...
  status            TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'duplicate' | 'void' | 'deleted'
  file_url          TEXT,                -- 'storage_path' in invoices / allowances table
  uploaded_at       TIMESTAMPTZ,
  ocr_status        TEXT,                -- 'pending' | 'done' | 'failed'
  doc_date          DATE,
  amount            NUMERIC,             -- 共通金額欄位（方便列表查詢）
  duplicate_of      UUID NULL REFERENCES documents(id),  -- 標記重複時指向原始那張 (TBD: necessary?)
  -- ...其他共通欄位
)

-- 特化層：發票（既有表補 document_id FK）
invoices (
  id                UUID PK,
  document_id       UUID UNIQUE NOT NULL REFERENCES documents(id),
  buyer_taxId         TEXT,
  seller_taxId        TEXT,
  invoice_no        TEXT,
  tax_amount        NUMERIC,
  -- ...保留所有既有欄位
)

-- 特化層：折讓單（既有表補 document_id FK）
allowances (
  id                  UUID PK,
  document_id         UUID UNIQUE NOT NULL REFERENCES documents(id),
  original_invoice_id TEXT,               -- 業務關聯：指向被折讓的發票號
  allowance_reason    TEXT,
  -- ...保留所有既有欄位
)

-- 分錄層（UI 層以「傳票」呈現）
journal_entries (
  id                UUID PK,
  status            TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'posted' | 'reversed'
  voucher_no        TEXT NULL,            -- 傳票編號（draft 時 NULL, posted 時賦號）
  voucher_type      TEXT NOT NULL,        -- '收入' | '支出' | '轉帳'
  entry_date        DATE NOT NULL,
  description       TEXT,
  document_id       UUID NULL UNIQUE REFERENCES documents(id),  -- 系統分錄可 NULL

  -- 沖銷關聯（自參照）
  reverses_entry_id UUID NULL REFERENCES journal_entries(id),
  reversal_reason   TEXT NULL,

  -- Constraints
  CONSTRAINT posted_has_voucher_no
    CHECK (status = 'draft' OR voucher_no IS NOT NULL),
  CONSTRAINT reversal_fields_consistent
    CHECK (
      (reverses_entry_id IS NULL AND reversal_reason IS NULL)
      OR
      (reverses_entry_id IS NOT NULL AND reversal_reason IS NOT NULL)
    ),
  CONSTRAINT unique_voucher_no
    UNIQUE (client_id, voucher_no)
)

-- 分錄明細
journal_entry_lines (
  id                UUID PK,
  journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id),
  account_code      TEXT NOT NULL,
  debit             NUMERIC DEFAULT 0,
  credit            NUMERIC DEFAULT 0,
  -- ...
)
```

---

## 五、情境 Illustrations

### 情境 A：買文具 3,300（有發票，最常見情境）

```
D1 文具店發票 (status='active')
  doc_type: invoice
  amount: 3,300
  date: 2026-04-23
  └─ invoices I1: {buyer_taxId: 60707504, invoice_serial_code: AB12345678, tax_amount: 157}

JE1 支出分錄 (status='posted', reverses_entry_id=NULL)
  document_id: D1
  voucher_no: 20260423-支-001
  voucher_type: 支出
  ├─ Dr 辦公用品費      3,143
  ├─ Dr 進項稅額          157
  └─ Cr 應付信用卡      3,300
```

---

### 情境 B：月底折舊（無憑證，系統生成）

```
(no document)

JE2 折舊分錄 (status='posted', reverses_entry_id=NULL)
  document_id: NULL          ← 系統分錄，無憑證
  voucher_no: 20260430-轉-005
  voucher_type: 轉帳
  ├─ Dr 折舊費用        5,000
  └─ Cr 累計折舊        5,000
```

---

### 情境 C：員工交回 5 張計程車發票

> **不合併**，拆成 5 筆獨立的 (document, journal_entry, lines) 組合。

```
D1 計程車發票1 → JE1
D2 計程車發票2 → JE2
D3 計程車發票3 → JE3
D4 計程車發票4 → JE4
D5 計程車發票5 → JE5
（每組各自完整，不共用分錄）
```

---

### 情境 D：銷貨退回（部分折讓，原發票仍有效）

**背景**：4/10 開發票銷貨 10,500，4/28 客戶退貨部分商品，開折讓單 500。

```
D10 原銷售發票 (status='active')
  doc_type: invoice
  amount: 10,500
  date: 2026-04-10

D11 折讓單 (status='active', original_invoice_id→D10 的 invoice.id)
  doc_type: allowance
  amount: 500
  date: 2026-04-28

JE10 原銷貨分錄 (status='posted', reverses_entry_id=NULL)
  document_id: D10
  voucher_no: 20260410-收-002
  voucher_type: 收入
  ├─ Dr 應收帳款       10,500
  ├─ Cr 銷貨收入       10,000
  └─ Cr 銷項稅額          500

JE11 折讓沖銷分錄 (status='posted', reverses_entry_id=JE10, reason='銷貨退回')
  document_id: D11
  voucher_no: 20260428-轉-012
  voucher_type: 轉帳
  ├─ Dr 銷貨退回與折讓     476
  ├─ Dr 銷項稅額            24
  └─ Cr 應收帳款           500
```

**注意**：JE10 的 status 維持 `posted`（部分退貨不是整筆作廢），`reverses_entry_id` 只在 JE11 上設定。

---

### 情境 E：對方開錯發票，全額折讓

**背景**：3/15 跟廠商買原料 21,000，4/20 廠商發現開錯，開折讓單 21,000 全額沖抵。

```
D1 原發票 (status='active')
  doc_type: invoice
  amount: 21,000
  date: 2026-03-15

D2 折讓單 (status='active', original_invoice_id→D1 的 invoice.id)
  doc_type: allowance
  amount: 21,000
  date: 2026-04-20

JE1 原進貨分錄 (status='reversed', reverses_entry_id=NULL)
  document_id: D1
  voucher_no: 20260315-支-001
  voucher_type: 支出
  ├─ Dr 原料            20,000
  ├─ Dr 進項稅額         1,000
  └─ Cr 應付帳款        21,000

JE2 折讓沖銷分錄 (status='posted', reverses_entry_id=JE1, reason='廠商開錯發票')
  document_id: D2
  voucher_no: 20260420-轉-007
  voucher_type: 轉帳
  ├─ Dr 應付帳款        21,000
  ├─ Cr 進貨退出        20,000
  └─ Cr 進項稅額         1,000
```

**關鍵**：因為是全額折讓，JE1.status 改為 `reversed`。兩張 document 都維持 `active`（都要申報）。

---

### 情境 F：同一張發票誤上傳兩次

**背景**：4/23 上傳發票記了帳，4/25 又把同一張發票再上傳一次並記帳，發現重複。

```
D1 原發票 (status='active')
  doc_type: invoice
  amount: 3,300
  invoice_no: AB12345678
  date: 2026-04-23

D2 重複上傳 (status='duplicate', duplicate_of→D1)
  doc_type: invoice
  amount: 3,300
  invoice_no: AB12345678
  date: 2026-04-23

JE1 原記帳分錄 (status='posted', reverses_entry_id=NULL)
  document_id: D1
  voucher_no: 20260423-支-001
  voucher_type: 支出
  ├─ Dr 辦公用品費       3,143
  ├─ Dr 進項稅額           157
  └─ Cr 應付信用卡       3,300

JE2 重複記帳分錄 (status='reversed', reverses_entry_id=NULL)
  document_id: D2
  voucher_no: 20260425-支-018
  voucher_type: 支出
  ├─ Dr 辦公用品費       3,143
  ├─ Dr 進項稅額           157
  └─ Cr 應付信用卡       3,300

JE3 沖銷分錄 (status='posted', reverses_entry_id=JE2, reason='重複入帳沖銷')
  document_id: NULL        ← 純會計動作，無新憑證
  voucher_no: 20260425-轉-019
  voucher_type: 轉帳
  ├─ Cr 辦公用品費       3,143
  ├─ Cr 進項稅額           157
  └─ Dr 應付信用卡       3,300
```

**關鍵觀察：**
1. D1 `active`、D2 `duplicate`（系統偵測 invoice_no 重複）
2. 沖銷的是 **JE2**（重複那筆），不是 JE1
3. 沖銷分錄 JE3 的 `document_id = NULL`（沒有新憑證）
4. 業務關聯：`D2.duplicate_of → D1`；會計關聯：`JE3.reverses_entry_id → JE2`

---

### 情境 G：自開銷項發票當月作廢（void）

**背景**：4/15 開出銷項發票 D1 金額 5,000，4/20 發現開錯（當月內），直接作廢。

```
D1 原發票 (status='void')     ← 真的作廢，不申報
  doc_type: invoice
  amount: 5,000
  date: 2026-04-15
  voided_at: 2026-04-20
  void_reason: '品項錯誤，當月作廢'

（不會有對應的折讓單）
（如果已經記帳，要加一筆沖銷分錄把帳拉平；如果還沒記帳就不用）
```

**關鍵**：`void` 只用在**同期內**作廢；跨期錯誤必須改走折讓（情境 E）。

---

## 六、錯帳修正的類型總覽

| 情境 | Documents 變化 | 分錄變化 | 沖銷記錄位置 |
|---|---|---|---|
| A 正常記帳 | 新增 1 份 `active` | 新增 1 筆分錄 | 無 |
| B 系統分錄（折舊等） | 無 document | 新增 1 筆分錄，`document_id=NULL` | 無 |
| D 部分折讓 | 新增 1 份折讓單 `active` | 新增 1 筆沖銷分錄；原分錄 **不** 變 reversed | `reverses_entry_id` |
| E 全額折讓 | 新增 1 份折讓單 `active` | 新增 1 筆沖銷分錄；原分錄變 `reversed` | `reverses_entry_id` |
| F 重複上傳 | 重複那張標 `duplicate` | 新增 1 筆純沖銷（`document_id=NULL`） | `reverses_entry_id` |
| G 發票作廢（同期） | 原發票 → `void` | 若已記帳需加沖銷分錄 | `reverses_entry_id` |
| 純錯帳修正 | 無新文件 | 新增 1 筆純沖銷 + 1 筆重記分錄 | `reverses_entry_id` |

---

## 七、未決議 / 待 refine 的設計點

以下項目在討論中浮現但未完全定案，建議在下一個 session 繼續釐清：

### 1. 重複偵測的時機
應發生在哪一步？
- (a) 上傳時即比對 invoice_no 阻擋
- (b) AI 辨識完才比對並標記 duplicate
- (c) 等用戶記完帳才發現（走情境 F 流程）

理想是 (a) 或 (b)，避免大量沖銷分錄污染總帳。

### 2. `documents.amount` 抽取策略
共通金額欄位抽到父表的程度：
- 抽太少 → 列表查詢需 JOIN 多張子表（效能差）
- 抽太多 → 和子表重複（資料一致性風險）
- 語意是否統一？發票正數、折讓可能要視為負數？

### 3. Posted 後的修改政策
- 是否允許修改已 posted 的分錄？
- 建議採台灣事務所慣例：**posted 後只能沖銷不能改**
- 是否需要 audit trail（誰、何時、為什麼沖銷）？

### 4. 進項 vs 銷項的 status 差異
目前建議統一用一個 `status` 欄位，用 application 層搭配 `doc_type` 做驗證。是否要 schema 層強制？

### 5. Voucher_no 賦號策略
- 格式：`YYYYMMDD-類型-NNN` vs `YYYY-MM-NNNN` vs 其他？
- Sequence 粒度：全公司 / 依類型 / 依年月？
- 跳號處理？年度重置？

### 6. 部分沖銷 vs 完全沖銷的判斷邏輯
目前 MVP 策略：
- `reverses_entry_id` 只用在**完全沖銷**（錯帳修正、全額折讓、重複入帳）
- **部分折讓**走 allowances 表的業務關聯，各自獨立分錄

是否需要進一步區分？例如新增 `reversal_type` 欄位？

---

## 八、設計原則總結（口訣）

1. **憑證是事實，分錄是動作** — documents 存客觀文件，journal_entries 存會計處理
2. **沖銷沖的是帳，不是單據** — 沖銷發生在分錄層，不在文件層
3. **一張憑證一筆分錄** — 教育用戶遵守這個規則，schema 才乾淨
4. **業務關聯和會計關聯分開走** — allowances→invoices 是業務；JE→JE 是會計
5. **UI 的傳票是分錄的 view，不是獨立實體** — voucher_no、voucher_type 是分錄的欄位
6. **Void vs 折讓要分清** — 同期作廢用 void，跨期錯誤用折讓