# 憑證（傳票）與分錄系統設計提案

> **文件狀態**：草稿 / 提案
> **目的**：建立基礎以產出客戶的損益表與資產負債表
> **預期**：本文件將經過多輪討論修訂，再進入實作階段

---

## 1. 背景與動機

目前 SnapBooks 已能擷取發票（發票）與折讓證明單（折讓），並可匯出財政部 TET_U / TXT 格式以利申報營業稅，**但尚未維護總帳（general ledger）**，因此無法為客戶產出：

- 損益表（Income Statement, 損益表）
- 資產負債表（Balance Sheet, 資產負債表）
- 其他需建立在分錄之上的報表（試算表、現金流量表等）

本提案在現有的 發票 / 折讓 之下新增三層資料模型：

```
發票 / 折讓 / 其他來源憑證（薪資、保險、預付費用攤提…）
        │
        ▼
   憑證（vouchers，傳票）
        │ 1 : N
        ▼
   分錄（journal_entries）   ← 強制 Σ借方 = Σ貸方
        │
        ▼
   account_period_balances（每月每科目彙總）
        │
        ▼
   損益表 / 資產負債表
```

**核心觀念**：發票只是憑證的一種類型（屬「營業稅相關」）。其他類型的憑證（保險費單、薪資單、預付費用攤提…）屬「非營業稅相關」，不可扣抵營業稅但仍須入帳。

---

## 2. 已敲定的設計決策

下列決策已於設計討論中拍板，本文後續內容均依此為前提。

| # | 決策項目 | 結論 | 備註 |
|---|---|---|---|
| 1 | 憑證產生時機 | 發票/折讓 `confirmed` 時自動產生 **draft** 憑證；員工檢視編輯後再 **post** | post 為一獨立動作，過帳後才影響財報 |
| 2 | 會計科目表 | v1 沿用現有靜態 `lib/data/accounts.ts`；`journal_entries` 儲存**純科目代碼**（如 `"5102"`） | 未來改為 DB 表時，因分錄已存純代碼，遷移幾乎為零成本 |
| 3 | 年度關帳 | 以**西元年**為單位的年度硬關帳；無月度軟關帳 | 對應台灣營利事業所得稅申報採曆年制 |
| 4 | 預付費用 / 批次入帳 | **手動**攤提憑證 — 員工每期自行建立一張正常憑證 | v1 不導入排程器；保留欄位以便日後加上 |

---

## 3. 資料模型

所有新增資料表沿用既有的 `get_auth_user_firm_id()` RLS 慣例（事務所層級隔離）。金額一律以 `BIGINT` 儲存整數新台幣，與現行 `extractedInvoiceDataSchema.totalSales/tax` 的 `.int()` 驗證一致。

### 3.1 `vouchers` — 憑證主檔

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | `gen_random_uuid()` |
| `firm_id` | UUID NOT NULL | FK → `firms` ON DELETE CASCADE |
| `client_id` | UUID NOT NULL | FK → `clients` ON DELETE CASCADE |
| `voucher_number` | TEXT NOT NULL | 每客戶每西元年度的序號，如 `"2024-0001"` |
| `voucher_date` | DATE NOT NULL | 用於決定所屬會計年度與月份 |
| `voucher_type` | TEXT NOT NULL | `purchase_invoice` / `sales_invoice` / `purchase_allowance` / `sales_allowance` / `payroll` / `insurance` / `prepaid_amortization` / `manual` / `opening_balance` / `closing_entry` |
| `source_kind` | TEXT NULL | `invoice` / `allowance` / NULL |
| `source_id` | UUID NULL | 對應發票或折讓的 id（手動憑證為 NULL） |
| `description` | TEXT | 摘要 |
| `status` | TEXT NOT NULL | `draft` / `pending_review` / `posted` / `void`，預設 `draft` |
| `posted_at` | TIMESTAMPTZ NULL | |
| `posted_by` | UUID NULL | FK → `profiles` |
| `voided_at` | TIMESTAMPTZ NULL | |
| `voided_by` | UUID NULL | FK → `profiles` |
| `void_reverses_voucher_id` | UUID NULL | FK → `vouchers`，紀錄沖銷哪一張憑證 |
| `created_by` | UUID NOT NULL | FK → `profiles` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**索引與限制**

- `UNIQUE (client_id, voucher_number)`
- `UNIQUE (source_kind, source_id) WHERE source_id IS NOT NULL` — 一張發票/折讓僅對應一張憑證
- `INDEX (client_id, voucher_date)` — IS/BS 查詢主路徑
- `INDEX (client_id, status)`

> **`pending_review` 之用途**：v1 不會用到，但保留 enum 值，未來開放客戶自行編輯憑證時即可使用，無需再 migrate。

---

### 3.2 `journal_entries` — 分錄明細

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `voucher_id` | UUID NOT NULL | FK → `vouchers` ON DELETE CASCADE |
| `line_number` | SMALLINT NOT NULL | 1, 2, 3… 顯示順序 |
| `account_code` | TEXT NOT NULL | **純代碼**，如 `"5102"`；應用層對照 `ACCOUNTS` 驗證 |
| `debit` | BIGINT NOT NULL DEFAULT 0 | 借方金額（NTD 整數，≥ 0） |
| `credit` | BIGINT NOT NULL DEFAULT 0 | 貸方金額（NTD 整數，≥ 0） |
| `description` | TEXT NULL | 行內備註 |

**索引與限制**

- `UNIQUE (voucher_id, line_number)`
- `CHECK (debit >= 0 AND credit >= 0 AND (debit > 0) <> (credit > 0))` — 同一行借貸**只能擇一**為正
- `INDEX (account_code, voucher_id)` — 總帳查詢用

**借貸平衡強制**

採延遲約束（deferred constraint）或 trigger，於 voucher 狀態切換到 `posted` 時驗證 `Σdebit = Σcredit`；不平衡則 post 失敗。

---

### 3.3 `fiscal_year_closes` — 年度關帳紀錄

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `firm_id` | UUID NOT NULL | |
| `client_id` | UUID NOT NULL | FK → `clients` |
| `gregorian_year` | SMALLINT NOT NULL | 例：2024 |
| `closed_at` | TIMESTAMPTZ NOT NULL | |
| `closed_by` | UUID NOT NULL | FK → `profiles` |
| `notes` | TEXT NULL | |

- `UNIQUE (client_id, gregorian_year)`

**效果**

- 該年度的**已過帳憑證不可編輯或作廢**
- 該年度不可新增憑證（`voucher_date` 落在該年的）
- 重啟年度需「刪除該筆紀錄」這個明確的管理動作

---

### 3.4 `account_period_balances` — 每月科目餘額（rollup）

供 IS/BS 快速查詢，並作為已關帳年度的快照憑據。

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `firm_id` | UUID NOT NULL | |
| `client_id` | UUID NOT NULL | FK → `clients` |
| `account_code` | TEXT NOT NULL | |
| `period_year` | SMALLINT NOT NULL | 西元年 |
| `period_month` | SMALLINT NOT NULL | 1–12 |
| `debit_total` | BIGINT NOT NULL DEFAULT 0 | |
| `credit_total` | BIGINT NOT NULL DEFAULT 0 | |
| `is_locked` | BOOLEAN NOT NULL DEFAULT false | 該月所屬年度已關帳則為 true |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |

- `UNIQUE (client_id, account_code, period_year, period_month)`
- `INDEX (client_id, period_year, period_month)`

**維護策略**

- 憑證 `post` / `void` 時，於同一交易中由服務層函式做**增量更新**
- 年度關帳時，將該年所有 row 標記 `is_locked = true`；之後永不重算
- 提供 `recomputeBalances(clientId, year, month)` 修復函式（非熱路徑）

---

## 4. 流程圖

### 4.1 發票 → 憑證 → 過帳 → 財報

```mermaid
flowchart TD
  A[使用者上傳發票] --> B[AI 擷取 processed]
  B --> C{員工 confirm?}
  C -->|否| B
  C -->|是| D[自動產生 draft 憑證 + 分錄]
  D --> E[員工於憑證頁檢視 / 編輯]
  E --> F{借貸平衡且科目齊全?}
  F -->|否| E
  F -->|是| G[Post 過帳]
  G --> H[更新 account_period_balances]
  H --> I[損益表 / 資產負債表 反映]
```

### 4.2 憑證狀態機

```mermaid
stateDiagram-v2
  [*] --> draft : 自動產生 / 手動建立
  draft --> posted : 過帳（借貸平衡）
  draft --> void : 作廢（直接捨棄）
  draft --> pending_review : v2 預留（客戶自編）
  pending_review --> posted : v2 管理員核准
  pending_review --> draft : v2 退回修改
  posted --> void : 作廢（年度未關帳才可）
  void --> [*]
```

### 4.3 年度關帳

```mermaid
flowchart TD
  A[管理員選定 client + 西元年 觸發關帳] --> B{該年度尚有 draft 憑證?}
  B -->|有| X[拒絕，請先處理完畢]
  B -->|無| C[寫入 fiscal_year_closes]
  C --> D[將該年度所有 account_period_balances<br/>標記 is_locked = true]
  D --> Y{是否要產生結帳分錄<br/>4xxx/6xxx → 3500 保留盈餘?}
  Y -->|v1 暫不自動| E[完成]
  Y -->|手動| Z[員工於下一年度建立 closing_entry 憑證]
```

### 4.4 發票更動 vs 憑證生命週期

```mermaid
flowchart TD
  A[員工要編輯已 confirmed 之發票] --> B{對應憑證狀態?}
  B -->|draft| C[允許編輯 → 重新產生分錄]
  B -->|posted| D[阻擋 → 提示先 void 該憑證]
  B -->|void| E[允許編輯 → 重新自動產生新 draft 憑證]
```

---

## 5. 憑證自動產生規則

當發票/折讓由 `processed` 進入 `confirmed` 時，於同一交易內呼叫 `voucher-generation` 服務產生 draft 憑證。

### 5.1 科目對照原則

| 科目角色 | 來源 | 預設值 |
|---|---|---|
| 銷項收入科目 | 固定 | `4101 營業收入` |
| 進項費用/成本科目 | 從 `extracted_data.account` 取出（剝去後綴名稱） | 由 Gemini 擷取時決定 |
| 進項稅額 | 固定 | `1147 進項稅額` |
| 銷項稅額 | 固定 | `2271 銷項稅額` |
| **結算科目（cash / AR / AP）** | 預設 `1112 銀行存款` | 員工於 draft 階段可改為 `1113 應收帳款` 或 `2151 應付帳款` |

> **結算科目（cash / AR / AP 類）**：每張發票都需要一個「另一邊」用以平衡借貸——代表這筆款項是現金結清還是賒帳。發票本身只有總額資訊，無法判斷已付或未付，故 v1 預設「銀行存款」並由員工視情況調整。日後可加入「客戶預設值」設定（如某客戶恆為應付帳款）。

### 5.2 分錄樣板

| 來源類型 | 借方 (Dr.) | 貸方 (Cr.) |
|---|---|---|
| **進項發票（可扣抵）** | 費用科目（銷售額），`1147 進項稅額`（稅額） | `1112 銀行存款`（總額） |
| **進項發票（不可扣抵）** | 費用科目（總額，含稅） | `1112 銀行存款`（總額） |
| **銷項發票** | `1112 銀行存款`（總額） | `4101 營業收入`（銷售額），`2271 銷項稅額`（稅額） |
| **進項折讓** | `1112 銀行存款`（總額） | 費用科目（折讓額），`1147 進項稅額`（折讓稅額） |
| **銷項折讓** | `4101 營業收入`（折讓額），`2271 銷項稅額`（折讓稅額） | `1112 銀行存款`（總額） |

**特例：`extracted_data.account` 缺漏**
若進項發票尚無對應科目（Gemini 未填或員工修正），憑證仍會產生但該行於 UI 標記為待補；缺科目則不允許 post。

### 5.3 範例

進項電子發票，銷售額 10,000、稅額 500、總額 10,500，Gemini 指派 `5102 旅費`：

| Line | Account | Debit | Credit |
|---|---|---|---|
| 1 | 5102 旅費 | 10,000 | 0 |
| 2 | 1147 進項稅額 | 500 | 0 |
| 3 | 1112 銀行存款 | 0 | 10,500 |

員工若知此筆為賒購，於 draft 階段將第 3 行 `1112` 改為 `2151 應付帳款`，再 post。

---

## 6. 損益表 / 資產負債表

### 6.1 查詢介面（服務層）

| 函式 | 輸入 | 邏輯 |
|---|---|---|
| `getIncomeStatement(clientId, fromDate, toDate)` | 期間 | 自 `account_period_balances` 加總**收入（4xxx）/ 成本（5xxx）/ 費用（6xxx, 8xxx）/ 業外收入（7xxx）**，得淨利 |
| `getBalanceSheet(clientId, asOfDate)` | 截止日 | 自 inception 累加至 `asOfDate`，分**資產（1xxx）/ 負債（2xxx）/ 權益（3xxx）**。已關帳年度直接讀 locked snapshot；當年度從分錄即時推算 |

### 6.2 科目分類（依首位數字，遵循台灣 COA 慣例）

| 首碼 | 類別 | IS 或 BS |
|---|---|---|
| 1xxx | 資產 | BS |
| 2xxx | 負債 | BS |
| 3xxx | 業主權益 | BS |
| 4xxx | 營業收入 | IS |
| 5xxx | 銷貨成本 | IS |
| 6xxx | 營業費用 | IS |
| 7xxx | 營業外收入 | IS |
| 8xxx | 營業外費用 | IS |
| 9xxx | 所得稅 | IS |

### 6.3 已關帳年度的「儲存」策略

- `account_period_balances` 表本身即為 rollup，月度粒度
- 年度關帳後 `is_locked = true`，未來查詢時不會重算，效能與審計可信度兼具
- 若發現歷史錯誤需修正，必須先「重啟年度」（刪除 `fiscal_year_closes` 該筆紀錄），且全程留痕

---

## 7. 各層改動清單（粗略）

> 本節僅為確認影響範圍，**詳細實作將於後續 session 處理**。

**新增**

- `supabase/migrations/<ts>_create_vouchers_and_journal_entries.sql`
- `lib/services/voucher.ts`、`voucher-generation.ts`、`financial-statements.ts`、`fiscal-year-close.ts`
- `lib/domain/voucher.ts`（Zod schema、enum）
- `app/firm/[firmId]/client/[clientId]/voucher/`（列表 / 詳情 / 編輯）
- `app/firm/[firmId]/client/[clientId]/reports/income-statement/`
- `app/firm/[firmId]/client/[clientId]/reports/balance-sheet/`

**修改**

- `lib/services/invoice.ts` / `allowance.ts` — confirm 時呼叫憑證產生；憑證已 post 時阻擋編輯
- `lib/domain/models.ts` — 新增 schema 與 enum
- `app/firm/[firmId]/client/[clientId]/period/[periodYYYMM]/page.tsx` — 已 confirm 行旁顯示對應憑證連結
- `components/firm-sidebar.tsx` — 新增「憑證」「損益表」「資產負債表」入口
- 重新產生 `supabase/database.types.ts`

---

## 8. 假設

| # | 假設 | 影響 |
|---|---|---|
| A1 | 所有金額為新台幣整數，不需小數位 | 沿用現行 `BIGINT` 設計 |
| A2 | 客戶採曆年制（1/1–12/31） | 關帳以西元年為單位 |
| A3 | 一張發票/折讓對應一張憑證 | 由 `UNIQUE (source_kind, source_id)` 強制 |
| A4 | 結算科目預設「銀行存款」對多數中小企業可接受 | 否則需在客戶設定中加入預設值 |
| A5 | Gemini 指派的 `extracted_data.account` 多數情況可用 | 缺漏時阻擋 post，由員工補正 |
| A6 | 發票編輯需先 void 對應已過帳憑證 | 員工流程上可接受（非自動沖銷） |
| A7 | 同一客戶同一年度 voucher_number 不會極高頻產生 | 序號生成採表鎖或 UNIQUE 衝突重試即可 |

---

## 9. v1 範圍外

- 每事務所 / 每客戶自訂科目表（COA 維持靜態）
- 客戶自行編輯憑證的 portal 流程（`pending_review` enum 已預留，UI 與權限留待 v2）
- 預付/攤提自動排程（v1 為手動）
- 月度軟關帳（v1 僅年度硬關帳）
- 多幣別
- 結帳分錄（closing entry）自動產生（v1 由員工手動建立）
- 現金流量表
- 沖銷憑證一鍵生成

---

## 10. 待討論問題（Open Questions）

| # | 問題 | 預設方向 |
|---|---|---|
| Q1 | 憑證序號格式 — `"2024-0001"`？要不要前綴 voucher_type？要不要 ROC 年（`"113-0001"`）？ | 暫定 `YYYY-NNNN` 西元年 |
| Q2 | 結算科目預設應為「銀行存款」、「應收/付帳款」還是「現金」？是否需「客戶預設值」？ | 預設「銀行存款」，員工可改 |
| Q3 | 進項不可扣抵發票的稅額是要併入費用？還是另外列「進項稅額—不可扣抵」？ | 暫定併入費用（最常見作法） |
| Q4 | 是否要將「審核者」「審核時間」加到 invoices/allowances（補審計軌跡）？ | 與本案解耦，可獨立提案 |
| Q5 | account_period_balances 的維護要走 trigger 還是純應用層？ | 建議純應用層，於同一 transaction 內處理；trigger 偵錯困難 |
| Q6 | 已 post 憑證的「沖銷」是直接 void，還是另開一張 `void_reverses_voucher_id` 指向原憑證的反向分錄憑證？ | 建議「反向分錄憑證」較符合會計慣例，原憑證不可消失 |
| Q7 | 結算（closing entry）要不要 v1 自動產生？目前列為「v1 範圍外、留 enum 值」 | 待確認業務流程偏好 |
| Q8 | 損益表 / 資產負債表的查詢期間單位 — 任意西元月份？或限制 ROC 申報期？ | 建議任意 Gregorian 月份；ROC 申報期作為快捷選項 |
| Q9 | 現有 `tax_filing_periods.status (open/locked/filed)` 與本案 `fiscal_year_closes` 是兩套鎖？兩者語意是否需對齊或合併？ | 本案僅鎖會計年度；申報期續鎖申報資料，互不衝突 |
| Q10 | 是否要紀錄憑證的附件（PDF、收據掃描）以利非發票類憑證？ | 建議 v1 重用 Supabase Storage，新增 `voucher_attachments` 表（後續討論） |

---

## 11. 後續步驟

1. 與會計顧問 / 領域專家 review 第 5 章的分錄樣板與第 10 章的 Open Questions
2. 收斂 Open Questions 至明確結論後更新本文件
3. 拆出 phased delivery（資料模型 → 自動產生 → 手動憑證 → 報表 → 關帳）
4. 開新 session 進入實作

---

*本文件為設計提案草稿，預期經多輪修訂後再進入實作階段。*
