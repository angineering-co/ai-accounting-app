# 憑證 / 分錄 / 總帳 — 階段式實作計畫

> **狀態追蹤**
> - ✅ Phase 1 完成（domain types + fake generator + dev store；72/72 測試綠）
> - ⏳ Phase 2 待啟動（傳票 UI）
>
> **配套文件**：[`VOUCHER_JOURNAL_ENTRY_PLAN.md`](./VOUCHER_JOURNAL_ENTRY_PLAN.md) — 已收斂的設計提案（Decisions #1–#12）。本文件中所有 §x.y 章節編號皆指向設計提案。

## Context

`docs/VOUCHER_JOURNAL_ENTRY_PLAN.md` 是已收斂的設計提案（Decisions #1–#12 已敲定）。本計畫把實作切成 **11 個可獨立交付、可獨立驗證的階段**。

**順序原則**（依使用者要求重排）：
1. **UI 儘早上場、且早期不鎖 schema**：Phase 1–4 完全不碰 DB / 不寫 migration。Domain types（Zod）+ in-memory fake generator 餵養 UI，可以反覆改 schema 形狀而不付遷移成本。
2. **UI/UX 確定後才實作 API / DB wiring**：RPC、CTI backfill、原子操作這些「已知怎麼做」的部分排在後面。
3. **In-place edit 早於 reverse**：使用者明確要求。
4. **Invoice 改動處同步處理 allowance**：Allowance 在 CTI / generation / posted edit 連動 / review dialog 等所有面向都要鏡像 invoice 的改法。
5. **fiscal_year_closes guard 隨各 RPC 一起加**，最終的「關帳動作 + UI」才是獨立階段。

**關於 /documents 頁面**：v1 不做。`documents` 表在 v1 純為 CTI 父表（後端概念，依 Q13 建議），唯二的 `doc_type` 是 `invoice` / `allowance`，期別頁（`/period/[periodYYYMM]`）已分別呈現。當 v2+ 加入非 VAT 子表（`receipt` / `payroll` / `insurance` / `manual`）時，一個「其他憑證」頁面才會有業務價值；schema 從 day 1 就能容納，無遷移負擔。

**v1 範圍外**：固定資產 / 攤提（§3.7、§3.8）、發票同期作廢 void（§5.6）、補申報、`extracted_data.account` 雙表示法收斂、account_period_balances rollup、/documents 獨立頁面。

---

## ✅ Phase 1 — Domain types + Fake data generator（**無 DB**）

**狀態**：完成（commit 待開）。

**目標**：定義 v1 GL 模組所有資料形狀的 Zod schemas，並寫一個可餵給 UI 的 in-memory fake data generator。**完全不寫 migration**。讓 phase 2/3 的 UI 可以反覆迭代而不付任何 schema 遷移成本。

**已交付**：
- `lib/domain/document.ts`：Zod `documentSchema` + `DOC_TYPE` / `DOC_STATUS` / `DOC_VAT_TYPE` / `DOC_OCR_STATUS` enums + 對應 TS 類型
- `lib/domain/journal-entry.ts`：Zod `journalEntrySchema`（含 `posted/reversed 必須有 voucher_no` refine）+ `journalEntryLineSchema`（含借貸 XOR refine）+ composite `journalEntryWithLinesSchema` + `VOUCHER_TYPE` / `ENTRY_STATUS` enums
- `lib/domain/audit-trail.ts`：Zod `auditTrailSchema` + `AUDIT_ACTION` / `AUDIT_ENTITY_TABLE` enums
- `tests/fixtures/voucher-demo-generator.ts`：`generateVoucherDemoData()` 用 counter-based 確定性 UUID，產出 9 筆 entries（3 drafts、5 posted、1 reversed；含 1 筆 posted-edited、1 筆系統分錄、1 筆缺科目 draft）+ 6 documents + 2 audit_trails
- `lib/dev/use-voucher-demo-store.ts`：`useSyncExternalStore`-backed 模組級 singleton（沿用 `hooks/use-infinite-query.ts` pattern）；mutations 包含 `saveDraftEntry` / `deleteDraftEntry` / `postEntries`（模擬 voucher_no seq）/ `editPostedEntry`（寫 audit row）/ `reverseEntry`（借貸對調 + 寫 audit row）/ `reset`
- `tests/fixtures/voucher-demo-generator.test.ts`：9 個測試（schema parsing、確定性、狀態覆蓋、借貸平衡 invariant、voucher_no 格式、line→entry FK 完整性）

**驗證紀錄**：`npm run lint` 無新錯誤；`npm run test:run` 72/72 全綠（含新增 9）。

---

## Phase 2 — 傳票 UI 全套（讀 fake generator、互動更新 in-memory store）

**目標**：把使用者可看到 / 互動的所有傳票 UI 一次畫完，與使用者敲定 UX。**所有讀寫都走 phase 1 的 in-memory store**。

**改動**：
- `app/firm/[firmId]/client/[clientId]/voucher/page.tsx`：傳票列表
  - 篩選：status（draft / posted / posted-edited / reversed）、日期範圍、客戶／文件類型
  - 勾選欄 + 批次 post 按鈕（§5.8 friction：confirmation dialog、必勾「我已逐筆檢查」）
  - 視覺區隔：draft 虛線淡灰、posted 實線白底 + voucher_no 粗體、reversed 灰底刪除線、posted-edited 加「✎ N 次」
  - 分頁（沿用 `usePaginatedPeriodInvoices` 的 SWR 模式形狀，但內部讀 store）
- `app/firm/[firmId]/client/[clientId]/voucher/[entryId]/page.tsx`：傳票詳情
  - Header（voucher_no、日期、status、posted by/at）
  - Lines 表（line_number / account / debit / credit / description）
  - 行動按鈕依 status：draft → 編輯／刪除／過帳；posted → 編輯（in-place edit）／沖銷；reversed → 連結反向分錄
  - 反向 / 被反向：雙向連結
  - 連結回對應 document（若有；NULL 則顯示「（無原始憑證）」處理系統分錄）
- `components/voucher-edit-dialog.tsx`：傳票編輯 dialog
  - Draft 模式：直接編輯 lines、無 reason 欄位
  - Posted 模式：reason 必填欄位（紅字提示「修改原因將永久記錄在審計軌跡中」）、`voucher_no` readonly、`posted_at` / `posted_by` readonly
  - shadcn Form + react-hook-form + Zod，沿用 `invoice-review-dialog.tsx` pattern
- `components/voucher-audit-history.tsx`：審計歷史 viewer（從 store 讀 audit_trails；diff 視覺化）
- `components/voucher-batch-post-dialog.tsx`：批次過帳 confirmation dialog（列出選取 entries、預期 voucher_no 範圍、checkbox「我已逐筆檢查」、submit 後 store 賦予假連續 voucher_no 並翻 status）
- `components/voucher-reverse-dialog.tsx`：沖銷 dialog（reason 必填、新分錄 entry_date 預設今天可改）
- `components/firm-sidebar.tsx`：加「傳票」入口
- `app/firm/[firmId]/client/[clientId]/period/[periodYYYMM]/page.tsx`：confirmed invoice / **allowance 兩處**都加「已產生 draft 傳票」連結（連到 voucher 詳情；id 由 store mock 對應）

**驗證**：
- `npm run dev` → 走完所有 UI flow（filter 切換、勾選、批次 post 對話框、編輯 draft、編輯 posted、沖銷、看審計歷史、in-memory mutations 即時反映）
- 與使用者多輪 review；**這個階段預期會反覆迭代**，因為沒有 DB lock-in，改動成本接近零
- text-base / text-sm 規則遵守
- 不影響任何既有功能（沒改任何 service action）

**退出條件**：使用者點頭，所有互動 mockup 過審；型別 / 欄位 / 互動已穩定到可以鎖 schema。

---

## Phase 3 — 損益表 / 資產負債表 UI（讀 fake generator 即時 SUM）

**目標**：把財報頁面畫完。即時 SUM 邏輯本身簡單；本階段 UI + 計算邏輯一起出，仍走 phase 1 的 store。

**改動**：
- `lib/services/financial-statements.ts`：`getIncomeStatement(clientId, fromDate, toDate)`、`getBalanceSheet(clientId, asOfDate)`，§6.1 即時 SUM、§6.2 科目首碼分類。**phase 3 內讀 store**；phase 5 切到 DB 時實作不變、只改資料來源
- `app/firm/[firmId]/client/[clientId]/reports/income-statement/page.tsx`：
  - 期間選擇器（任意 Gregorian 月份 + ROC 申報期快捷，沿用 `RocPeriod`）
  - 收入 / 成本 / 費用 / 業外 / 所得稅 折疊區塊
  - 淨利大字
- `app/firm/[firmId]/client/[clientId]/reports/balance-sheet/page.tsx`：
  - 截止日選擇器
  - 資產 / 負債 / 權益 三欄
  - 借貸總計（強制相等斷言；不等則紅字警示）
- `components/firm-sidebar.tsx`：加「損益表」、「資產負債表」入口
- 沿用 `lib/utils.ts`；如有需要可加 `formatNTD` helper

**驗證**：
- 用 phase 1 fake data 手算 IS / BS 對得上頁面
- 與使用者 review 版面、欄位、捲動行為

**退出條件**：使用者點頭；報表計算邏輯（首碼分類、IS/BS 公式）在 fake data 上驗證正確。

---

## Phase 4 — 純函式：分錄推導 + 帳號代碼解析

**目標**：把「從 invoice / allowance 推導出分錄」的純邏輯寫滿並用單元測試覆蓋。**仍不碰 DB**。為 phase 7 預備可信賴的計算核心。

**改動**：
- `lib/services/journal-entry-generation.ts`：
  - `computeEntryFromInvoice(invoice)` → `{ voucher_type, entry_date, description, lines[] }`
  - `computeEntryFromAllowance(allowance)` → 同上
  - 涵蓋 §5.2 全部樣板：進項可扣抵 / 不可扣抵、銷項、進項折讓、銷項折讓
  - §5.1 結算科目門檻：≤ 10,000 → `1111`，> 10,000 → `1112`
- `lib/services/journal-entry-generation.test.ts`：完整單元測試，cases 涵蓋 §5.3 範例 A、B、五種樣板、缺 `extracted_data.account` placeholder
- `lib/data/accounts.ts`：加 `extractAccountCode(fullString)`（`"5102 旅費"` → `"5102"`）+ runtime check：所有 `ACCOUNT_LIST` 字串符合 `/^\d{4} \S/`
- `lib/data/accounts.test.ts`：覆蓋 extractAccountCode（單寬空白、多空白、無空白應 throw）

**驗證**：
- `npm test` 全綠
- 沒碰 DB、沒改 UI

**退出條件**：所有樣板的 debit / credit 與 account_code 都通過單元測試。

---

## Phase 5 — Schema 落地 + 切換 UI 至真實 DB

**目標**：UI / 計算邏輯都已在 fake data 上驗過；現在把 schema 落到 DB 並把 UI 從 store 切到真實 service。**Journal entries / lines / documents 此刻仍為空表**（CTI backfill 在 phase 6、`confirm_invoice` 真實寫入在 phase 7），所以 voucher 列表會顯示「尚無資料」，這是預期行為。

**改動**：
- Migrations（單一 commit）：
  - `<ts>_create_documents.sql`(§3.1 + RLS + indices)
  - `<ts>_create_journal_entries.sql`(§3.3 + §3.4 + RLS + indices + CHECK)
  - `<ts>_create_voucher_sequences.sql`(§3.5 + RLS)
  - `<ts>_create_fiscal_year_closes.sql`(§3.6 + RLS)
  - `<ts>_create_audit_trails.sql`(§3.9 + indices + RLS)
  - 所有 RLS 鏡像 `invoices` 政策（`firm_id = public.get_auth_user_firm_id()` + super_admin 旁路）
- `lib/services/journal-entry.ts`、`document.ts`、`audit-trail.ts`：read helpers（`getEntry` / `listEntriesByClient` / `getEntryWithLines` / `listAuditTrailsForEntity`）—— 與 phase 1 store API 同形狀，UI 不改
- 切換點：phase 1 的 `useVoucherDemoStore` 替換為 `useVoucherStore`（內部用 SWR + Supabase）；hook 簽章不變、UI 完全不動
- `lib/services/financial-statements.ts`：phase 3 內部從 store 改為 SQL（§6.1 即時 SUM）
- `tests/utils/supabase.ts`：cleanup 加新表 cascade
- 重新產生 `supabase/database.types.ts`
- **保留 fake generator** 在 dev 模式下可選（`?demo=1` query param 切換），方便日後還想用 fake data 驗 UI 的場景

**驗證**：
- Migrations 套用乾淨；type-check 通過
- Integration test：CHECK 真擋住違規 row（debit/credit 同正、status 非法值、voucher_no posted 時不可 NULL）
- Integration test：RLS 真隔離（service-role 看得到、一般使用者只看得到自家 firm）
- 手動：傳票 / IS / BS 三頁切到真 DB 後，列表顯示「尚無資料」（預期）；既有期別頁、TET_U 匯出完全不退步
- 既有 invoice / allowance 整合測試全綠

**退出條件**：UI 從 store 切到 service，所有頁面渲染正常（即使內容為空）。

---

## Phase 6 — `documents` CTI backfill（invoices + **allowances 同步**）

**目標**：把既有 invoices 與 allowances 收斂到 documents 之下。Phase 5 已建空表；本階段做 backfill + 加 `NOT NULL UNIQUE`。

**改動**：
- Migration `<ts>_backfill_documents_from_invoices_allowances.sql`：
  - 為每張既有 `invoice` INSERT 對應 documents row（`doc_type='invoice'`、`type='VAT'`、`doc_date = extracted_data.date` 缺漏退回 `created_at::date`、`amount = extracted_data.totalAmount`、`file_url = storage_path`、`status='active'`、firm_id / client_id 從 invoice 帶）
  - **同次 backfill 處理 allowances**（`doc_type='allowance'`、`type='VAT'`、`amount = extracted_data.amount + taxAmount`、其他欄位 mapping 同上）
  - `invoices` 加 `document_id UUID`（先 nullable）→ 回填 → `RAISE EXCEPTION` 若仍 NULL（fail loud）→ 加 `NOT NULL UNIQUE`
  - **同次 migration 對 `allowances` 做完全相同的處理**：加欄位 → 回填 → fail loud → NOT NULL UNIQUE
- `lib/services/document.ts`：補 `createDocument` / `updateDocument` helpers（純表操作）
- 重新產生 `supabase/database.types.ts`

**參考**：`supabase/migrations/20260126000001_backfill_periods.sql` 為相同 pattern。

**驗證**：
- Integration test：
  - `SELECT count(*) FROM invoices WHERE document_id IS NULL` = 0
  - `SELECT count(*) FROM allowances WHERE document_id IS NULL` = 0
  - `SELECT count(*) FROM documents d JOIN invoices i ON i.document_id = d.id WHERE d.firm_id != i.firm_id` = 0
  - 同上 for allowances
- 既有 invoice / allowance 整合測試全綠
- 手動：既有期別頁、TET_U 報表匯出完全正常

**退出條件**：CTI 完成（雙子表）；既有功能不退步。

---

## Phase 7 — `confirm_invoice` + `confirm_allowance` + `regenerate_draft_entry` RPCs

**目標**：把 phase 4 的純邏輯接上 DB，原子地產生 draft entries。Phase 2 的傳票 UI 此刻開始顯示真實 draft entries。**Invoice 與 allowance 兩條 confirm 路徑都要處理**。

**改動**：
- Migration `<ts>_create_confirm_invoice_rpc.sql`：PL/pgSQL — 取 invoice → upsert documents → upsert journal_entry（status=draft、voucher_no=NULL、document_id 指對應 documents）→ replace lines。Idempotent。
- Migration `<ts>_create_confirm_allowance_rpc.sql`：**同樣邏輯處理 allowance**（樣板不同：進項折讓 / 銷項折讓兩種）
- Migration `<ts>_create_regenerate_draft_entry_rpc.sql`：吃 `entity_type` + `entity_id`（invoice 或 allowance），要求對應 entry.status='draft' 否則 RAISE EXCEPTION。Lines wholesale DELETE + INSERT，header in-place UPDATE 保 entry.id（§5 重生策略）
- `lib/services/invoice.ts::updateInvoice`：status 翻到 confirmed → `supabase.rpc('confirm_invoice')`；編輯 confirmed invoice 且 entry='draft' → `regenerate_draft_entry`
- `lib/services/allowance.ts`：**鏡像 invoice 的所有改動** — `updateAllowance` 同樣派發到 `confirm_allowance` / `regenerate_draft_entry`

**驗證**：
- Integration tests `tests/integration/services/journal-entry-generation.test.ts`：
  - 確認新 invoice → draft entry + lines 正確（4 種樣板：進項可扣抵 / 不可扣抵 / 銷項 / 缺 account）
  - **確認新 allowance → draft entry + lines 正確（2 種樣板：進項折讓 / 銷項折讓）**
  - 編輯已 confirmed invoice（draft 已存在）→ entry.id 保留、lines 整批替換
  - 編輯已 confirmed allowance（draft 已存在）→ 同上
  - 編輯已 confirmed invoice / allowance 但 entry 已 posted → regenerate 拒絕
- 手動：confirm 一張 invoice + 一張 allowance → 進傳票列表 → 兩筆 draft 正確顯示

**退出條件**：所有 confirmed invoice / allowance 都自動產生對應 draft entry。

---

## Phase 8 — `post_journal_entries` RPC（接 phase 2 的批次過帳）

**目標**：phase 2 已建好的「批次過帳」按鈕從 in-memory mutation 切到真實 RPC。

**改動**：
- Migration `<ts>_create_post_journal_entries_rpc.sql`：完整實作 §5.4
  - FOR UPDATE 排序、status check、balance check、**fiscal_year_closes guard**、atomic seq UPSERT（`voucher_sequences`）、status flip
  - **no-gap 紀律 4 條全部遵守**（table-based seq、所有 fail check 在 seq 消耗之前、不用 SAVEPOINT、UPDATE 不可能失敗）
- `lib/services/journal-entry.ts`：加 `postJournalEntries(entryIds, userId)` → `supabase.rpc(...)`
- 把 phase 2 的批次過帳 dialog 從 store mutation 切到真 RPC；過帳完成後 inline 顯示逐筆結果（成功 ✓ + voucher_no、失敗紅字 + error）

**驗證**：
- Integration test `tests/integration/services/post-journal-entries.test.ts`：
  - happy（單筆 + 批次）、idempotent、unbalanced 拒絕
  - 部分成功 → 成功者的 voucher_no 連續無 gap（**核心 invariant**）
  - 不同 client 並發互不阻塞
  - 已關帳年度的 entry_date 拒絕（guard 內建，phase 11 close action 會驗）
- 手動：confirm 5 張 invoice / allowance 混合 → 批次選取 → post → 5 個連號 voucher_no

**退出條件**：no-gap test 通過；UI 過帳流程順手。

---

## Phase 9 — `edit_posted_entry` RPC + audit_trails 必填寫入路徑（in-place edit）

**目標**：phase 2 已建好的「編輯 posted」dialog 從 store mutation 切到真 RPC。**早於 reverse**（依使用者要求）：in-place edit 處理高頻 OCR / key-in 錯。**Invoice 與 allowance 兩條編輯連動路徑都要處理**。

**改動**：
- Migration `<ts>_create_edit_posted_entry_rpc.sql`：取舊 row + lines snapshot → UPDATE entry header（`voucher_no` / `posted_at` / `posted_by` / `created_*` 不可改）→ DELETE + INSERT lines → INSERT audit_trails row（`action='updated'`、before 必填、reason 必填、actor_id = userId）。**fiscal_year_closes guard**。
- `lib/services/journal-entry.ts`：加 `editPostedEntry(id, patch, reason, userId)`
- `lib/services/audit-trail.ts`：補 `getStateAfter(auditRow)` helper（§3.9）
- `lib/services/invoice.ts::updateInvoice`：當員工編輯一張 confirmed invoice 對應的 entry 已 posted（§5.6.1 路徑 B1b）→ dispatch 至 `editPostedEntry`，連動 in-place update entry
- `lib/services/allowance.ts::updateAllowance`：**鏡像 invoice 的派發邏輯** — confirmed allowance 對應 entry 已 posted 時，連動 editPostedEntry
- `components/invoice-review-dialog.tsx`：當對應 entry='posted' 時加 reason 欄位 + 警示條：「⚠️ 此發票已過帳為傳票 X，修改將連動更新該傳票並留下審計記錄」
- `components/allowance-review-dialog.tsx`：**同樣加 reason 欄位 + 警示條**（鏡像 invoice review dialog）
- 把 phase 2 的 voucher edit dialog（posted 模式）+ audit history viewer 從 store 切到真 service

**驗證**：
- Integration test：
  - editPostedEntry → audit_trails before snapshot 等於改前 row state
  - 連續多次 edit → 每筆 audit before = 前一筆 audit 的「after」（透過 getStateAfter 推導）—— **chain 完整性**
  - 已關帳年度拒絕（guard）
  - 透過 invoice 編輯路徑連動觸發 editPostedEntry → audit_trails 正確
  - **同上 for allowance 編輯路徑**
- 手動：編輯 posted entry → reason 必填 → 提交後 voucher_no 不變、變更歷史可展開

**退出條件**：路徑 1（直接改帳本）+ 路徑 2 連動（改 invoice / 改 allowance 連動 entry）皆通過 §5.6.1 決策表 B1b。

---

## Phase 10 — `reverse_entry` RPC（沖銷）

**目標**：phase 2 已建好的「沖銷」按鈕從 store mutation 切到真 RPC。

**改動**：
- Migration `<ts>_create_reverse_entry_rpc.sql`：原子地 (1) INSERT 新 journal_entry（lines 借貸對調、`reverses_entry_id` 指原 entry、entry_date 由呼叫者帶入、預設今天、新 entry 自帶 voucher_no via seq）(2) 原 entry status → `reversed`，同時 INSERT audit_trails row（entity=原 entry、action='reversed'、reason 必填）。**fiscal_year_closes guard 對新 entry 的 entry_date 套用**（原 entry 的 entry_date 可能在已關帳年度，這是允許的）
- `lib/services/journal-entry.ts`：加 `reverseEntry(entryId, reason, userId, entryDate?)`
- 把 phase 2 的沖銷 dialog 從 store mutation 切到真 RPC

**驗證**：
- Integration test：沖銷 happy（新 entry 借貸對調、reverses_entry_id 正確、原 entry status='reversed'）/ 已 reversed 不能再沖 / reason 必填 / 新 entry entry_date 落在已關帳年度 → guard 拒絕 / IS-BS 加總（反向分錄抵消原分錄）
- 手動：post 一張錯的 → 點沖銷 → 看到原 entry 變灰 + 新反向分錄連回

**退出條件**：員工有沖銷逃生口；UI 從 store 完全接通。

---

## Phase 11 — 年度關帳

**目標**：上線「鎖定該年度帳本」的管理動作。`fiscal_year_closes` 表自 phase 5 起即存在；每個會碰 entry_date 的 RPC（phase 8 / 9 / 10）都已內建 guard。

**改動**：
- `lib/services/fiscal-year-close.ts`：`closeFiscalYear(clientId, year, userId, notes?)`（要求該年度無 draft entries）、`reopenFiscalYear(closeId)`
- `app/firm/[firmId]/client/[clientId]/fiscal-year-close/page.tsx`：admin 觸發頁面（角色為 admin / super_admin 才顯示）
- `components/firm-sidebar.tsx`：加「年度關帳」入口（依角色顯示）

**驗證**：
- Integration test：關帳後 post / reverse / editPostedEntry 對該年度 entry_date 全部拒絕；reopen 後恢復；該年度 IS/BS 數字凍結
- 手動：實機跑一次關帳 → 嘗試編輯 → 預期看到拒絕訊息

**退出條件**：v1 GL 模組功能閉環。

---

## v1 範圍外（後續另開計畫）

- 固定資產（§3.7）+ 攤提（§3.8）+ amortization-worker（pgmq + pg_cron）
- 發票同期作廢 void（§5.6 上半）+ 跨期折讓自動產生（§5.6 下半）
- VAT 補申報流程
- `account_period_balances` 月度 rollup（觸發條件見 §6.3）
- `extracted_data.account` 雙表示法收斂（目前 invoice 端存 `"5102 旅費"`、entry line 端存 `"5102"`）
- audit_trails 全面寫入（v1 僅 posted entry edit / reverse 必填）
- **/documents 獨立頁面**（v2+ 加入非 VAT `doc_type` 後才有業務意義）

---

## 關鍵檔案 / 函式 reference

**新增 — Phase 1（無 migration，已完成）**：
- `lib/domain/document.ts`、`journal-entry.ts`、`audit-trail.ts`
- `tests/fixtures/voucher-demo-generator.ts` + `.test.ts`
- `lib/dev/use-voucher-demo-store.ts`

**新增 — Phase 2/3（UI）**：
- `app/firm/[firmId]/client/[clientId]/voucher/page.tsx`、`voucher/[entryId]/page.tsx`
- `app/firm/[firmId]/client/[clientId]/reports/income-statement/page.tsx`、`reports/balance-sheet/page.tsx`
- `components/voucher-edit-dialog.tsx`、`voucher-audit-history.tsx`、`voucher-batch-post-dialog.tsx`、`voucher-reverse-dialog.tsx`
- `lib/services/financial-statements.ts`（phase 3 讀 store → phase 5 改讀 SQL）

**新增 — Phase 4（純函式）**：
- `lib/services/journal-entry-generation.ts` + `.test.ts`

**新增 — Phase 5（schema + 切換 UI）**：
- `supabase/migrations/<ts>_create_documents.sql`
- `supabase/migrations/<ts>_create_journal_entries.sql`
- `supabase/migrations/<ts>_create_voucher_sequences.sql`
- `supabase/migrations/<ts>_create_fiscal_year_closes.sql`
- `supabase/migrations/<ts>_create_audit_trails.sql`
- `lib/services/journal-entry.ts`、`document.ts`、`audit-trail.ts`（read helpers）

**新增 — Phase 6 起**：
- `supabase/migrations/<ts>_backfill_documents_from_invoices_allowances.sql`（phase 6，**雙子表同步**）
- `supabase/migrations/<ts>_create_confirm_invoice_rpc.sql`（phase 7）
- `supabase/migrations/<ts>_create_confirm_allowance_rpc.sql`（phase 7，**鏡像 invoice 版**）
- `supabase/migrations/<ts>_create_regenerate_draft_entry_rpc.sql`（phase 7，吃 entity_type + entity_id）
- `supabase/migrations/<ts>_create_post_journal_entries_rpc.sql`（phase 8）
- `supabase/migrations/<ts>_create_edit_posted_entry_rpc.sql`（phase 9）
- `supabase/migrations/<ts>_create_reverse_entry_rpc.sql`（phase 10）
- `lib/services/fiscal-year-close.ts` + `fiscal-year-close/page.tsx`（phase 11）

**修改**：
- `lib/services/invoice.ts`（phase 7 接 confirm/regenerate RPC、phase 9 派發至 editPostedEntry）
- `lib/services/allowance.ts`（**phase 7、phase 9 鏡像 invoice 的所有改動**）
- `lib/data/accounts.ts`（phase 4 加 extractAccountCode + 格式 lint）
- `lib/domain/models.ts`（每階段相應 schema）
- `components/invoice-review-dialog.tsx`（phase 2 加 reason 欄位 + 警示條外觀；phase 9 真接 editPostedEntry）
- `components/allowance-review-dialog.tsx`（**phase 2 / phase 9 鏡像 invoice review dialog**）
- `components/firm-sidebar.tsx`（phase 2 / 3 / 11 入口）
- `app/firm/[firmId]/client/[clientId]/period/[periodYYYMM]/page.tsx`（phase 2 在 invoice + allowance 兩處都加「已產生 draft 傳票」連結）
- `tests/utils/supabase.ts`（phase 5 cleanup 加新表；phase 6 加 documents）
- `supabase/database.types.ts`（每次 migration 後 regenerate）

**Reuse 既有**：
- RLS 函式 `public.get_auth_user_firm_id()`（`supabase/migrations/20251230032712_init.sql:41`）
- `createTestFixture` / `cleanupTestFixture`（`tests/utils/supabase.ts:104`）
- `RocPeriod`（`lib/domain/roc-period.ts`）
- `toRocYearMonth` / `toGregorianDate`（`lib/utils.ts:57`）
- `ACCOUNT_LIST` / `ACCOUNTS`（`lib/data/accounts.ts`）
- shadcn Dialog + Form pattern（`components/invoice-review-dialog.tsx`）
- `usePaginatedPeriodInvoices` SWR pattern（`hooks/use-paginated-period-invoices.ts`）

---

## 端到端驗證腳本（每階段交付前最後一道防線）

每個 phase 都跑：
1. `npm run supabase:start`（phase 5 起需要）
2. `npx supabase migration up`（phase 5 起需要）
3. `npx supabase gen types typescript --local --schema public --schema pgmq_public > supabase/database.types.ts`（phase 5 起每次 migration 後）
4. `npm run lint`
5. `npm run test:run`
6. `npm run dev` → 走完該階段「手動驗證」清單（happy + edge cases）
7. （phase 6 起）走「既有發票流程不退步」smoke：上傳 invoice → AI extract → review → confirm → 期別頁渲染、TET_U 匯出生成
8. （phase 7 起）**同上 smoke 對 allowance 跑一次**

每階段完成後 commit + 開 PR，**不**等所有階段一起合併。
