# 憑證 / 分錄 / 總帳 — 階段式實作計畫

> **狀態追蹤**
> - ✅ Phase 1 完成（domain types + fake generator + dev store；72/72 測試綠）
> - ✅ Phase 2 完成（傳票 UI 全套：列表 / 詳情 / 編輯 dialog / 審計歷史 / 批次過帳 / 沖銷 dialog / sidebar 入口 / 期別頁雙處連結）
> - ⏳ Phase 3 待啟動（損益表 / 資產負債表 UI）
> - 📋 Phase 5.5（新增）：upload pipeline refactor 為 documents-first（為 Upload Classifier 計畫鋪路）
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

**關於 /documents 頁面**：本 Voucher 計畫範圍內 v1 不做。`documents` 表在本計畫的 v1 純為 CTI 父表（後端概念，依 Q13 建議），唯二的 `doc_type` 是 `invoice` / `allowance`，期別頁（`/period/[periodYYYMM]`）已分別呈現。當 Upload Classifier 計畫進場後（見 `UPLOAD_CLASSIFIER_PLAN.md`），`doc_type='other'` 才會真正產生 documents-only 的 row,屆時「最簡 /documents 列表」（只列 `doc_type='other'` 的待分類文件 + 重分類動作）會納入 **Classifier 計畫**範圍，不在本 Voucher 計畫內。

**Documents-first upload pipeline（Phase 5.5 起）**：原 phased plan 預設「`createInvoice` / `createAllowance` 連動建 documents」（subtable-first），是為了減少對既有 upload 入口的改動。但此方向與 Upload Classifier 的天然語意（判決寫 documents、`other` 結果停留 documents、子表是衍生）擰著。Phase 5.5 把 upload pipeline 倒置為 **documents-first**：所有上傳第一時間建 documents row，再依使用者選擇（或日後 classifier 判決）路由到 invoice/allowance 子表。Phase 5.5 內 UI **不變**（使用者仍預先選 in/out），只是內部 service 拆解 + OCR 觸發點改繫到 documents insert；`doc_type='other'` 的路徑要等 classifier 進場才會啟用（本計畫 v1 範圍內不會出現 `other`）。

**v1 範圍外**：固定資產 / 攤提（§3.7、§3.8）、發票同期作廢 void（§5.6）、補申報、`extracted_data.account` 雙表示法收斂、account_period_balances rollup、/documents 獨立頁面（最簡列表由 Classifier 計畫帶入）。

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

## ✅ Phase 2 — 傳票 UI 全套（讀 fake generator、互動更新 in-memory store）

**狀態**：完成。

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

## Phase 5.5 — Upload pipeline refactor 為 documents-first

**目標**：把所有上傳入口改為「**先建 documents row，再依使用者選擇路由到 invoice / allowance 子表**」。UI **不變**（使用者仍預先選 in/out）；改的是內部 service 拆解 + OCR 觸發點。為日後 Upload Classifier 進場（`doc_type='other'` 才能停在 documents、判決天然寫 documents）鋪路，但本階段 classifier 尚未進場，`doc_type` 仍只會是 `invoice` / `allowance`。

**設計重點**：
- 原既有路徑（subtable-first）：`createInvoice(args)` → INSERT invoices → 觸發 OCR；`createAllowance(args)` → INSERT allowances → 觸發 OCR。documents 在 Phase 6 backfill 補上、之後由 Phase 7 RPC 維護 upsert。
- 新路徑（documents-first）：`createDocument(args)` → INSERT documents → 觸發 OCR；之後 `linkInvoiceToDocument(documentId, ...)` / `linkAllowanceToDocument(documentId, ...)` 建立對應子表 row。
- OCR 觸發點隨之改變：從「invoice / allowance row insert 後觸發擷取」改為「**document row insert 且 `doc_type ∈ {invoice, allowance}` 時**觸發擷取」。本階段 `doc_type` 永遠是這兩者之一,觸發行為等同既有。
- 既有 invoice / allowance 子表結構不變（仍透過 `document_id` 反向 FK 連到 documents）；改的只是「先後順序」。

**Storage bucket 重新命名（隨本階段一起做）**：

現況：所有 invoice / allowance 檔案都存於 Supabase Storage 的 **`invoices`** bucket（`lib/services/invoice.ts:233`、`lib/services/allowance.ts:166` 等多處硬編碼）。這個名稱已是歷史誤命名（實際同時存兩種 doc_type），documents-first 之後再加 `'other'`（Classifier 階段）會讓誤命名更尷尬。Phase 5.5 把這個技術債一次清掉。

**改動**：
1. 建立新 bucket `documents`（migration 或 dashboard 操作）；RLS / policy 與既有 `invoices` bucket 一致
2. 把既有 `invoices` bucket 內所有檔案搬到 `documents` bucket（保留原路徑 `{firmId}/{periodYYYMM}/{clientId}/{uuid}.{ext}`）。建議用 `supabase storage cp` 或 SQL `storage.objects` table 批次 UPDATE bucket_id（後者較快、需小心 RLS）
3. 全面替換程式碼中的 bucket 名稱：
   - `lib/services/invoice.ts`：lines 233（remove）、~379-381（download）
   - `lib/services/allowance.ts`：lines 166（download）、~296+（remove）
   - `lib/services/document.ts`（Phase 5.5 新增的 `createDocument`）：上傳寫入點
   - 任何 `<components>` / `<hooks>` 中對 `supabase.storage.from('invoices')` 的呼叫
   - `useSupabaseUpload` hook（如有寫死 bucket 名稱）
4. 舊 bucket `invoices` 於確認新流程穩定後刪除（建議保留 1-2 個 release cycle 作 rollback 緩衝）

**為何這個一定要做**：
- 概念一致：父表叫 documents、bucket 叫 invoices,Classifier 進來後又會塞 `doc_type='other'` 的文件進「invoices」bucket,讀程式碼會困惑
- 一次過：搬一次 bucket 比每次新增 doc_type 都解釋為什麼非 invoice 的文件存在 invoices bucket 簡單得多
- Classifier 計畫的 `doc_type='other'` 才能語意一致地存在 `documents` bucket

**驗證 bucket 搬遷**：
- 寫一個 integration test：列出 `invoices` bucket 與 `documents` bucket 的物件清單,assert `documents` bucket 包含所有 `invoices` bucket 的物件且路徑一致
- 手動：找一筆既有的 invoice + 一筆 allowance,download → 確認讀的是新 bucket、檔案內容不變
- Worker 端：extraction-worker 對新 bucket 路徑能讀檔
- 既有期別頁的「下載原檔」按鈕仍可運作（更新所有 signed URL 來源）

**改動**：
- `lib/services/document.ts`：新增 `createDocument(args)` server action — auth + 授權 → storage upload（沿用 `useSupabaseUpload` 之上傳結果路徑）→ INSERT documents（`doc_type` 從 args 帶入，預設來自使用者選擇；`status='active'`、`ocr_status='pending'`）→ 觸發 OCR worker（pgmq enqueue，沿用既有 extraction-worker pattern）→ 回傳 `documentId`
- `lib/services/invoice.ts::createInvoice`：拆成兩個函式：
  - `createInvoice(args)`：對外向後相容的入口，內部呼叫 `createDocument` + `linkInvoiceToDocument`（一個 transaction 內完成）。既有所有呼叫端（`document-upload-section.tsx`、`invoice-upload-dialog.tsx`、portal upload parent）**不需改動**
  - `linkInvoiceToDocument(documentId, vatArgs)`：純表操作 — INSERT invoices（`document_id` 指定、VAT 專屬欄位從 args 帶入）
- `lib/services/allowance.ts::createAllowance`：**鏡像 invoice 的拆法** — `createAllowance` 內部呼叫 `createDocument` + `linkAllowanceToDocument`
- OCR 觸發點移轉：原 `createInvoice` / `createAllowance` 內的 enqueue 改到 `createDocument` 內（依 `doc_type` 條件 enqueue）。`extraction-worker` 本身**不需改**（仍讀 file_url、寫 invoice / allowance.extracted_data），因為 worker 走的是 document_id 反向 join 找子表 row。
- `extraction-worker`：worker 內部從 documents.id 找到對應子表 row 寫入 `extracted_data`。若同期有 invoice / allowance 子表 row 尚未建立的時間窗（理論上 `createDocument` + `linkInvoiceToDocument` 同 transaction 應不會發生），加 retry / skip-and-log 機制。
- `lib/domain/models.ts`：`createDocumentSchema` Zod schema（args 形狀）
- `tests/integration/services/document.test.ts`：新增——createDocument happy、與 linkInvoiceToDocument 合併 transaction 失敗時 documents row 不殘留（rollback）、單元測試 createInvoice 對外行為與 phase 5 前完全一致

**Phase 6 / Phase 7 的連帶影響**：
- Phase 6 backfill 邏輯**不變**：仍是「對既有 invoice / allowance 建 documents row」（舊資料,subtable-first 留下的）。backfill 方向與新 upload 流程的方向相反,但邏輯獨立、可共存。
- Phase 7 `confirm_invoice` / `confirm_allowance` RPC **簡化**：documents 已在上傳時存在,RPC 不再需要 `upsert documents`,只需要「取 invoice/allowance → 建立 entry」。詳見 Phase 7。

**Reuse 既有**：
- Storage upload pattern（`useSupabaseUpload`、storage path convention `{firmId}/{periodYYYMM}/{clientId}/{uuid}.{ext}`）
- pgmq enqueue pattern（`extraction-worker` 上游）
- Auth + 授權 pattern（`lib/services/invoice.ts:76-104`）

**驗證**：
- Integration test：透過 `createInvoice` / `createAllowance` 上傳一張檔案 → DB 內 documents row 與 invoice / allowance row 同 transaction 出現（兩者皆存在或都不存在,無中間態）
- Integration test：transaction rollback case — 模擬 `linkInvoiceToDocument` 失敗,documents row 不殘留
- `extraction-worker` 整合測試：對新流程上傳的 row 仍可正常 OCR、寫入 `extracted_data`、翻 status 到 `processed`
- 手動：上傳 1 張 invoice + 1 張 allowance 跑全流程 → AI extract → review → confirm → 期別頁渲染、TET_U 匯出生成,**完全不退步**
- 既有 invoice / allowance 整合測試全綠（對外行為不變）

**退出條件**：所有上傳走 documents-first；對外 service API 保持向後相容；既有 invoice / allowance UI 與報表完全不退步。

> **重要**：本階段**不**做 `doc_type='other'` 支援、**不**做 /documents 列表、**不**改 `documents.doc_type` enum。這些都留給 Upload Classifier 計畫進場時帶入（詳見 `UPLOAD_CLASSIFIER_PLAN.md`）。本階段純粹是「為 classifier 鋪路、保持既有功能完全不退步」的內部重構。

---

## Phase 6 — `documents` CTI backfill（invoices + **allowances 同步**）

**目標**：把**既有**（Phase 5.5 之前留下的、subtable-first 路徑建立的）invoices 與 allowances 收斂到 documents 之下。Phase 5 已建空表；Phase 5.5 之後新建的 invoice / allowance 已是 documents-first 流程、不需 backfill。本階段做 backfill + 加 `NOT NULL UNIQUE`。

> **方向說明**：Phase 6 backfill 是「subtable → documents」（舊資料補建父表 row），Phase 5.5 之後的新流程是「documents → subtable」。兩者方向相反但邏輯獨立、可共存；Phase 6 結束後 `invoices.document_id` / `allowances.document_id` 之 `NOT NULL UNIQUE` 對新舊資料一體適用。

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

> **與原計畫的差異**：Phase 5.5 起 documents 已在上傳當下建立、Phase 6 之後既有資料也都有對應 documents row,所以 confirm RPC **不再需要 `upsert documents`**,只負責「取 invoice/allowance → 建立 entry → replace lines」。RPC 邏輯更簡單、語意更清楚。

**改動**：
- Migration `<ts>_create_confirm_invoice_rpc.sql`：PL/pgSQL — 取 invoice → upsert journal_entry（status=draft、voucher_no=NULL、`document_id = invoice.document_id`）→ replace lines。Idempotent。若 `invoice.document_id` 為 NULL（理論上不會發生,Phase 6 之後有 `NOT NULL` 約束保護）→ RAISE EXCEPTION fail loud。
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
- **/documents 獨立頁面**（最簡列表由 Upload Classifier 計畫帶入；v2+ 加入非 VAT `doc_type` 後擴充為完整文件管理）
- **`doc_type='other'` 支援**（由 Upload Classifier 計畫帶入,本 Voucher 計畫範圍內 `doc_type` 永遠 ∈ {invoice, allowance}）

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

**新增 — Phase 5.5（upload pipeline refactor）**：
- `lib/services/document.ts`：補 `createDocument(args)` server action（write 路徑;Phase 5 只有 read helpers）
- `tests/integration/services/document.test.ts`：新增（createDocument + linkInvoiceToDocument 合併 transaction 行為）

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
- `lib/services/invoice.ts`（**phase 5.5 拆為 createDocument + linkInvoiceToDocument,對外 createInvoice 行為保持不變**；phase 7 接 confirm/regenerate RPC、phase 9 派發至 editPostedEntry）
- `lib/services/allowance.ts`（**phase 5.5 / 7 / 9 全部鏡像 invoice 的改動**）
- `supabase/functions/extraction-worker/`（**phase 5.5** OCR 觸發點從 invoice/allowance row 改為 document row;worker 內部從 documents.id 反向 join 找子表 row 寫入 extracted_data;**bucket 名稱從 `invoices` 改為 `documents`**）
- **Storage bucket rename `invoices` → `documents`（phase 5.5）**:影響所有 `supabase.storage.from('invoices')` 呼叫點 — `lib/services/invoice.ts:233/379-381`、`lib/services/allowance.ts:166/296+`、`lib/services/document.ts`(新增 createDocument)、`useSupabaseUpload` hook 與其他元件中的 storage 呼叫。詳見 Phase 5.5 內 "Storage bucket 重新命名" 段
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
