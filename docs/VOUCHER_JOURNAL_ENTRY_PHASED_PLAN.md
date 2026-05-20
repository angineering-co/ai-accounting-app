# 憑證 / 分錄 / 總帳 — 階段式實作計畫

> **狀態追蹤**
> - ✅ Phase 1 完成（domain types + fake generator + dev store；72/72 測試綠）
> - ✅ Phase 2 完成（傳票 UI 全套：列表 / 詳情 / 編輯 dialog / 審計歷史 / 批次過帳 / 沖銷 dialog / sidebar 入口 / 期別頁雙處連結）
> - ✅ Phase 3 完成（損益表 / 資產負債表 UI）
> - ✅ Phase 4 完成（純函式：分錄推導 + 帳號代碼解析；130/130 測試綠，新增 22）
> - ✅ Phase 5.5 完成（documents-first row 建立：createInvoice / createAllowance 先建 documents 父表 row，子表以 document_id FK 連結；180/180 測試綠）
> - 📋 Phase 5.6（新增）：storage 清理（建 documents bucket、搬移既有檔案、路徑重排）
> - 📋 Phase 6.5（新增）：Drizzle ORM + 交易層（取代 PL/pgSQL RPC，為 Phase 7+ 原子寫入鋪路）
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

**Documents-first upload pipeline（Phase 5.5 起）**：原 phased plan 預設「`createInvoice` / `createAllowance` 連動建 documents」（subtable-first），是為了減少對既有 upload 入口的改動。但此方向與 Upload Classifier 的天然語意（判決寫 documents、`other` 結果停留 documents、子表是衍生）擰著。Phase 5.5 把 upload pipeline 倒置為 **documents-first**：每次上傳先建 documents row，再建 invoice / allowance 子表 row，子表透過新增的 `document_id` FK 連回父表。UI **不變**（使用者仍預先選 in/out），改的只是 `createInvoice` / `createAllowance` 內部拆解。OCR 觸發點不受影響，擷取本來就不在 row insert 當下發生（見下方 Phase 5.5 說明）。

**storage 與 row 流程拆開（Phase 5.5 vs 5.6）**：原 Phase 5.5 草案把 `invoices` → `documents` storage bucket 改名一併納入，會讓單一階段橫跨 row 與 storage 兩個不相干的面向、並擴散到所有 preview / download / delete 呼叫點。改為：Phase 5.5 只做 documents-first 的 **row 建立**（沿用既有 `invoices` bucket，不動任何 storage 程式碼）；Phase 5.6 再獨立做 storage 清理（建 `documents` bucket、搬移既有檔案、改採 `/{firmId}/{clientId}/{periodYYYMM}/` 路徑）。一次性搬遷讓 storage 維持單一 bucket；雙 bucket 並存會把「逐 row 判斷 bucket」的邏輯永久散佈到約 10 個讀取點，故避免之。`doc_type='other'` 的路徑要等 classifier 進場才會啟用（本計畫 v1 範圍內不會出現 `other`）。

**v1 範圍外**：固定資產 / 攤提（§3.7、§3.8）、發票同期作廢之**自動化連動沖銷**（§5.6;v1 可手動編輯 `invoices.extracted_data.taxType='作廢'`,TET_U 自動依此產出格式碼 F,但**不**自動建反向分錄）、補申報、`extracted_data.account` 雙表示法收斂、account_period_balances rollup、/documents 獨立頁面（最簡列表由 Classifier 計畫帶入）、duplicate detection（v1 移除 `duplicate_of` 與 `status='duplicate'`,誤上傳走 soft delete）。

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

## ✅ Phase 4 — 純函式：分錄推導 + 帳號代碼解析

**狀態**：完成。

**目標**：把「從 invoice / allowance 推導出分錄」的純邏輯寫滿並用單元測試覆蓋。**仍不碰 DB**。為 phase 7 預備可信賴的計算核心。

**已交付**：
- `lib/services/journal-entry-generation.ts`：
  - `computeEntryFromInvoice(invoice)` → `ComputedEntry { voucher_type, entry_date, description, lines[] }`,涵蓋 §5.2.1 全部 3 發票樣板：進項可扣抵（3 行）/ 不可扣抵（2 行,費用吸收稅額）/ 銷項（3 行）
  - `computeEntryFromAllowance(allowance, originalEntry)` — **Decision #13**：折讓不用樣板,而是鏡像原發票之 posted entry 結構（科目從原 entry lines 取出 → 借貸對調 → 替換金額為折讓 amount / taxAmount）。涵蓋進項折讓（鏡像可扣抵 3 行 / 鏡像不可扣抵 2 行 / 追隨原 entry 之科目編輯）/ 銷項折讓（鏡像 3 行）
  - 缺對應 entry 之退路：純函式本身不處理（caller 須合成 minimal originalEntry,詳 §5.2.2）
  - §5.1 結算科目門檻：`pickSettlementAccount()` ≤ 10,000 → `1111`，> 10,000 → `1112`（**僅發票走此門檻;折讓鏡像原 entry 之結算,不重跑門檻**）
  - 固定科目常數：`ACCT_INPUT_TAX='1144'` / `ACCT_OUTPUT_TAX='2134'` / `ACCT_REVENUE='4101'` / `ACCT_CASH='1111'` / `ACCT_BANK='1112'`（§5.1 doc 中 `1147/2271` 為舊代碼;實際 `lib/data/accounts.ts` 為 `1144/2134`,以實際為準）
  - `ComputedEntryLine.account_code: string`（不可為 null）：發票走 `confirmed` 前 staff 必選 account 之前置條件保證,缺則 throw fail loud;折讓由原 entry 帶入,結構上不可能 null
  - **v1 `taxType` 政策**（矩陣詳見 §5.2.1）：
    - 進項 應稅 / 零稅率 / 免稅 → 正常產出分錄（零稅率/免稅 走 2 行不可扣抵路徑,因 tax=0 結構等同 NON_VAT 收據）
    - 銷項 應稅 → 正常產出 3 行分錄;銷項 零稅率 / 免稅 → throw（reports.ts 尚有 TODO,跨層協調後才解禁）
    - 作廢 / 彙加（任何方向）→ throw（作廢屬業務未發生;彙加為 TET_U 合成 row）
  - `entry_date` 格式：`extracted_data.date`（YYYY/MM/DD）→ YYYY-MM-DD；缺漏退回 `created_at::date`（UTC,與 Phase 6 backfill convention 一致）
- `lib/services/journal-entry-generation.test.ts`：21 個測試,cases 涵蓋 §5.3 範例 A（10,500 進項可扣抵）/ B（210 進項不可扣抵）/ 銷項 / 進項折讓鏡像可扣抵 / 進項折讓鏡像不可扣抵（2 行）/ 銷項折讓 / 折讓追隨原 entry 科目編輯 / 結算鏡像而非重跑門檻 / 缺 account throw / output 不需 account / deductible 預設值 / entry_date fallback / threshold boundary / malformed original entry throw / 借貸平衡 invariant
- `lib/data/accounts.ts`：
  - `extractAccountCode(fullString)`：`"5102 旅費"` → `"5102"`,支援 4–6 位數代碼（`"119901 應退稅額"` → `"119901"`）
  - 模組載入時 runtime check：所有 `ACCOUNT_LIST` 字串符合 `/^\d{4,6} \S/`（plan doc 寫 `/^\d{4} \S/` 但 ACCOUNT_LIST 已有 6 位數子分類代碼,實作放寬到 4-6 與 `ACCOUNT_CODE_REGEX` 一致）
- `lib/data/accounts.test.ts`：6 個測試,覆蓋 4 位數 / 6 位數 / 多空白（split 第一個）/ 無空白 throw / 前綴非數字 throw / 全 `ACCOUNT_LIST` round-trip

**驗證紀錄**：`npm run type-check` 通過；`npx eslint` 對新增 4 個檔案無錯誤；`npm run test:run` 135/135 全綠（含新增 27）。

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

## ✅ Phase 5.5 — documents-first 上傳流程（僅 row 建立）

**狀態**：完成（PR #189）。

**目標**：把 `createInvoice` / `createAllowance` 改為「**先建 documents 父表 row，再建 invoice / allowance 子表 row**」，子表透過新增的 `document_id` FK 連回父表。為日後 Upload Classifier 進場（判決天然寫 documents、子表是衍生）鋪路。UI、上傳入口、對外 service 簽章全部不變，使用者無感。

**範圍刻意限縮，本階段不碰 storage**：原草案把 `invoices` → `documents` bucket 改名併入本階段，會讓單一階段橫跨 row 與 storage 兩個不相干的面向，並把「逐 row 判斷 bucket」擴散到所有 preview / download / delete 呼叫點。改為：Phase 5.5 只做 row 建立，沿用既有 `invoices` bucket，不動任何 storage 程式碼、不動 extraction-worker；storage 清理獨立為 Phase 5.6。

**與原計畫的差異**：`document_id` 欄位提前到 5.5 加（nullable）。documents-first 若沒有這個欄位就無從「連結」。5.5 加 nullable 欄位（5.5 之前的舊 row 沒有對應 document）；Phase 6 再 backfill 舊 row 並收緊為 `NOT NULL UNIQUE`。

**OCR 觸發點不受影響**：擷取本來就不在 row insert 當下發生，而是由期別頁的手動或批次 pgmq enqueue 觸發（以 `entity_id` 為鍵）。extraction-worker 仍讀子表的 `storage_path`、仍從 `invoices` bucket 下載，無需改動。

**無 transaction 的限制**：依使用者長期偏好不使用 PostgREST RPC（日後改用 Drizzle ORM 處理 server-side SQL），Supabase JS client 因此沒有跨語句 transaction，`createDocument` + 子表 INSERT 無法真正原子。緩解方式：所有驗證（Zod parse、period-lock 檢查）都排在 documents INSERT 之前，子表 INSERT 唯一的失敗模式只剩罕見的 DB error；子表 INSERT 失敗時 best-effort 刪掉剛建的 documents row。極端情況（兩個 INSERT 之間 process crash）仍可能殘留孤兒 documents row，可接受，孤兒只是一筆沒有子表的 `status='active'` 父 row，Phase 6 會收斂。

**改動**：
- `supabase/migrations/<ts>_add_document_id_to_invoices_allowances.sql`：`invoices` / `allowances` 各加 nullable `document_id UUID REFERENCES documents(id)` + index
- `lib/domain/document.ts`：新增 `createDocumentSchema`（args 形狀），reuse 既有 `DOC_TYPE` / `DOC_VAT_TYPE` / `DOC_OCR_STATUS` enums
- `lib/services/document.ts`：新增 `createDocument(data, options?)` server action，流程為 auth → `createDocumentSchema.parse` → INSERT documents（`status='active'`、`ocr_status='pending'`、`type='VAT'`；`doc_date` 上傳當下無 OCR 資料，先以今日佔位）→ 回傳 `documentId`。`options` 可注入 `supabaseClient` / `userId`，供 server action 內呼叫端 reuse
- `lib/services/invoice.ts::createInvoice`：對外簽章不變（新增一個 optional `options` 參數，既有呼叫端不需改）。順序為 auth → parse → period-lock 檢查 → `createDocument` → INSERT invoices（帶 `document_id`）→ 失敗則 best-effort 刪 document
- `lib/services/allowance.ts::createAllowance`：鏡像 invoice 的拆法（`doc_type='allowance'`，無 period-lock 檢查）
- `tests/utils/supabase.ts`：修 `cleanupTestFixture` 的 FK 刪除順序（`documents` 為 invoices / allowances / journal_entries 的父表，須最後刪；順帶補上漏掉的 `allowances`）
- `tests/integration/services/{document,invoice-create,allowance-create}.test.ts`：新增，涵蓋 createDocument happy、createInvoice / createAllowance 同時產出 documents 父 row 與子 row 且 `document_id` 正確連結、子表 INSERT 失敗時孤兒 document 被清掉、對外行為與 5.5 前一致

**Reuse 既有**：
- Auth 與注入式 options pattern（`lib/services/firm.ts`、`lib/services/invoice-import.ts` 的 `{ supabaseClient }`）
- `createTestFixture` / `cleanupTestFixture`（`tests/utils/supabase.ts`）

**驗證**：
- Migration 套用乾淨後 regenerate `supabase/database.types.ts`
- `npm run lint`、`npm run test:run` 全綠
- 手動：上傳 1 張 invoice + 1 張 allowance → UX 完全一致、DB 內出現對應 documents row、子表 `document_id` 指向它、批次與手動 OCR 仍正常

**退出條件**：所有經 `createInvoice` / `createAllowance` 的上傳都先建 documents row；對外 service API 向後相容；既有 invoice / allowance UI 與報表完全不退步。

> **重要**：本階段**不**做 storage（bucket / 路徑）、**不**做 `doc_type='other'`、**不**做 /documents 列表。storage 留給 Phase 5.6，其餘留給 Upload Classifier 計畫。

**Phase 6 / Phase 7 的連帶影響**：
- Phase 6 backfill 邏輯**不變**：仍是「對既有（5.5 之前留下的）invoice / allowance 建 documents row」。backfill 方向與新流程相反但邏輯獨立、可共存。
- Phase 7 `confirm_invoice` / `confirm_allowance` **簡化**：documents 已在上傳時存在，不再需要 `upsert documents`，只需「取 invoice/allowance → 建立 entry」。

---

## Phase 5.6 — storage 清理（documents bucket + 檔案搬遷）

**目標**：把儲存層從歷史誤命名的 `invoices` bucket 收斂到語意正確的 `documents` bucket，並把 key 路徑改為符合實體階層的 `/{firmId}/{clientId}/{periodYYYMM}/`。本階段與 Phase 5.5 的 row 流程正交，獨立成一個 PR。

**為何獨立成階段**：`invoices` bucket 實際同時存 invoice / allowance 兩種 doc_type，名稱已是誤命名；Classifier 進場後再塞 `doc_type='other'` 會更尷尬。但這是純 storage 的整理，與 documents-first 的 row 重構無關。一次性把所有檔案搬到 `documents` bucket，storage 維持單一 bucket；若採雙 bucket 並存，則需把「逐 row 判斷 bucket」的邏輯永久散佈到約 10 個 preview / download / delete 呼叫點，故避免之。

**改動**：
1. 建立新 bucket `documents`（migration，鏡像 `20260112000000_create_electronic_invoices_bucket.sql` 的 INSERT 與 INSERT/SELECT/DELETE policies；policy 以 `(storage.foldername(name))[1] = firm_id` 為界，與 `invoices` bucket 一致）
2. 把既有 `invoices` bucket 內所有檔案搬到 `documents` bucket。建議用 storage API 的 copy（非破壞性、可驗證後再切換），先 copy 全部、比對物件數、再切程式碼、確認穩定後才刪舊 bucket
3. 採用新 key 路徑 `/{firmId}/{clientId}/{periodYYYMM}/{uuid}.{ext}`（對齊 `Firm → Client → Period` 實體階層，一個 client 的所有檔案落在同一 prefix，方便列舉與刪除）
4. 全面替換程式碼中的 bucket 名稱與路徑組法：
   - 上傳點（`bucketName: "invoices"` → `"documents"`）：`components/document-upload-section.tsx`、`components/invoice/invoice-upload-dialog.tsx`、`hooks/use-pre-ai-upload-queue.ts`
   - 讀取點（download / delete / signed URL）：`lib/services/invoice.ts`、`lib/services/allowance.ts`、`components/invoice-review-dialog.tsx`、`components/allowance-review-dialog.tsx`、`components/invoice-table.tsx`、`components/allowance-table.tsx`、`components/invoice-search-result-row.tsx`、`components/file-preview-dialog.tsx`
   - `supabase/functions/extraction-worker/`：下載 bucket 改名；edge function 須重新部署
5. 舊 bucket `invoices` 於確認新流程穩定後刪除（建議保留 1-2 個 release cycle 作 rollback 緩衝）

**驗證**：
- 搬遷 integration test：比對 `invoices` 與 `documents` bucket 物件清單，assert `documents` 含所有原物件
- 手動：找既有 invoice / allowance，download → 確認讀新 bucket、檔案內容不變；期別頁「下載原檔」可運作
- extraction-worker 對新 bucket 路徑能讀檔、OCR 正常
- 上傳新檔走全流程 → AI extract → review → confirm → 期別頁、TET_U 匯出，完全不退步

**退出條件**：所有檔案在 `documents` bucket；所有 storage 呼叫點指向新 bucket；舊 bucket 可安全刪除。

---

## Phase 6 — `documents` CTI backfill（invoices + **allowances 同步**）

**目標**：把**既有**（Phase 5.5 之前留下的、subtable-first 路徑建立的）invoices 與 allowances 收斂到 documents 之下。Phase 5 已建空表；Phase 5.5 之後經 `createInvoice` / `createAllowance` 新建的 invoice / allowance 已是 documents-first 流程、不需 backfill。本階段做 backfill + 加 `NOT NULL UNIQUE`，並把最後一條未收編的寫入路徑（電子發票匯入 `processElectronicInvoiceFile`）也改為 documents-first，否則 `NOT NULL` 上線後新的匯入會違反約束。

> **方向說明**：Phase 6 backfill 是「subtable → documents」（舊資料補建父表 row），Phase 5.5 之後的新流程是「documents → subtable」。兩者方向相反但邏輯獨立、可共存；Phase 6 結束後 `invoices.document_id` / `allowances.document_id` 之 `NOT NULL UNIQUE` 對新舊資料一體適用。

**改動**：
- Migration `<ts>_backfill_documents_from_invoices_allowances.sql`：
  - 為每張既有 `invoice` INSERT 對應 documents row（`doc_type='invoice'`、`type='VAT'`、`doc_date = extracted_data.date` 缺漏退回 `created_at::date`、`amount = extracted_data.totalAmount`、`file_url = storage_path`、`status='active'`、firm_id / client_id 從 invoice 帶）
  - **同次 backfill 處理 allowances**（`doc_type='allowance'`、`type='VAT'`、`amount = extracted_data.amount + taxAmount`、其他欄位 mapping 同上）
  - `document_id` 欄位已於 Phase 5.5 加為 nullable → 本階段回填既有 NULL row → `RAISE EXCEPTION` 若仍 NULL（fail loud）→ 加 `NOT NULL UNIQUE` 約束
  - **同次 migration 對 `allowances` 做完全相同的處理**：回填 → fail loud → 加 NOT NULL UNIQUE
- **電子發票匯入路徑收編（`lib/services/invoice-import.ts::processElectronicInvoiceFile`）**：此路徑用 `chunkedUpsert` 批次寫入 invoices / allowances，從未經過 `createInvoice` / `createAllowance`，Phase 5.5 未涵蓋。本階段改為 documents-first：
  - 每個 upsert 之前，先以 conflict key（invoice 為 `client_id, invoice_serial_code`；allowance 為對應 key）pre-fetch 既有 row 的 `document_id`
  - 既有 row 已有 `document_id` → reuse；新 row 或 `document_id` 為 NULL → 批次 INSERT documents（`doc_date` / `amount` 直接取自 `extracted_data`，電子發票擷取已完成，`ocr_status` 標 `done`）
  - 把 `document_id` 併入 row 物件後再 `chunkedUpsert`
  - **idempotent**：匯入本就支援重跑；document 建立也做成「既有則 reuse」，故重跑不產生重複 documents、也不需交易。此路徑無需等 Drizzle（見 Phase 6.5）
  - **上線順序**：此程式碼改動必須與「加 `NOT NULL` 約束」的 migration 同時或更早部署，否則新匯入會違反約束
- `lib/services/document.ts`：補 `updateDocument` helper（`createDocument` 已於 Phase 5.5 建立）
- 重新產生 `supabase/database.types.ts`

**參考**：`supabase/migrations/20260126000001_backfill_periods.sql` 為相同 pattern。

**驗證**：
- Integration test：
  - `SELECT count(*) FROM invoices WHERE document_id IS NULL` = 0
  - `SELECT count(*) FROM allowances WHERE document_id IS NULL` = 0
  - `SELECT count(*) FROM documents d JOIN invoices i ON i.document_id = d.id WHERE d.firm_id != i.firm_id` = 0
  - 同上 for allowances
- Integration test：跑一次電子發票匯入 → 每張匯入的 invoice / allowance 都有對應 documents row；**重跑同一檔案 → documents 數量不變（idempotent、無重複）**
- 既有 invoice / allowance 整合測試全綠（含 `invoice-import.test.ts`）
- 手動：既有期別頁、TET_U 報表匯出完全正常

**退出條件**：CTI 完成（雙子表）；所有寫入路徑（單張上傳 + 電子發票匯入）皆 documents-first；`document_id` 為 `NOT NULL UNIQUE`；既有功能不退步。

---

## Phase 6.5 — Drizzle ORM + 交易層

**目標**：引入 Drizzle ORM，提供真正的多語句資料庫交易（`db.transaction()`），作為 Phase 7-11 所有原子寫入的基礎。本階段對應設計提案 `VOUCHER_JOURNAL_ENTRY_PLAN.md` §12 的 **Option C**，並落實 Decision #10 的 2026-05 修訂（原訂 Option A 純 SDK + PL/pgSQL RPC，因實際原子操作達 6 支、documents-first 多表寫入、且確立不擴增 PostgREST RPC 而改採）。本階段只建基礎設施，不改業務邏輯。

**為何需要獨立階段**：
- Phase 7-11 的寫入（產生 entry + lines、post 的 no-gap voucher 序號配發 + 行鎖、reverse / edit 的 entry + lines + audit_trail 多表寫入）都需要原子性與 `SELECT ... FOR UPDATE`，這是 Supabase JS client（PostgREST）做不到的。
- documents-first 的單張上傳（Phase 5.5）靠「best-effort 清理」、電子發票匯入（Phase 6）靠「idempotent 重跑」繞過缺少交易的問題；這在 Phase 7+ 行不通（post 的序號配發不是 idempotent，無法靠重跑收斂）。
- 把連線 / pooling / RLS 等基礎設施決策獨立成一階段，避免混進業務階段。

**改動**（遷移路徑見 `VOUCHER_JOURNAL_ENTRY_PLAN.md` §12「落地」）：
- 加入 `drizzle-orm` + `drizzle-kit` 依賴；以 `drizzle-kit pull`（introspection）產生 `lib/db/schema.ts`。`supabase/migrations` 仍是 schema 的 single source of truth，Drizzle schema 只供型別與查詢建構
- `lib/db/drizzle.ts`（新）：connection。走 Supabase Supavisor 的 transaction-mode pooler（port 6543），新環境變數 `DATABASE_URL`，須設 `prepare: false`
- `lib/db/rls.ts`（新）：RLS helper（依下方決策實作）
- **RLS 決策（關鍵，本階段須定案）**：Drizzle 走直連 Postgres，**繞過 RLS**。二擇一：
  - (a) 每個 transaction 內 `SET LOCAL request.jwt.claims = ...`，讓既有 RLS 政策仍生效
  - (b) Drizzle 寫入一律以 service role 連線，firm 隔離改在 service 層顯式強制（`where firm_id = ...` + 授權檢查）
  - 傾向 (b)：較簡單、與既有注入式 service client 測試模式（`createTestFixture` 用 service client）一致；代價是 service 層必須自律帶 firm 範圍
- 不改任何現有業務程式碼；Phase 7 起的跨表原子寫入才用 Drizzle，service 介面形狀不變

**驗證**：
- Spike 測試：在一個 `db.transaction()` 內寫兩張表、中途 throw → 兩張表都 rollback
- RLS 決策若採 (a)：驗證跨 firm 寫入被擋；若採 (b)：service 層 firm-scope 測試
- 既有功能完全不退步（本階段不改業務碼）

**退出條件**：Drizzle 連線 + 交易 helper 可用；RLS 策略定案並有測試；Phase 7-11 可在此基礎上以 app-layer transaction 取代 PL/pgSQL RPC。

> **對 Phase 7-11 的影響**：以下各階段標題與內文出現的「RPC」、`Migration <ts>_create_*_rpc.sql` 等字樣，實作時應理解為 **Drizzle app-layer transaction**（在 `lib/services/` 內以 `db.transaction()` 實作），而非 PostgREST RPC。原子性、`FOR UPDATE` 行鎖、fail-loud 等語意不變，只是實作層從 PL/pgSQL 移到 TypeScript。各階段內文待實作時逐一改寫。

---

## Phase 7 — `confirm_invoice` + `confirm_allowance` + `regenerate_draft_entry` RPCs

**目標**：把 phase 4 的純邏輯接上 DB，原子地產生 draft entries。Phase 2 的傳票 UI 此刻開始顯示真實 draft entries。**Invoice 與 allowance 兩條 confirm 路徑都要處理**。

> **與原計畫的差異**：Phase 5.5 起 documents 已在上傳當下建立、Phase 6 之後既有資料也都有對應 documents row,所以 confirm RPC **不再需要 `upsert documents`**,只負責「取 invoice/allowance → 建立 entry → replace lines」。RPC 邏輯更簡單、語意更清楚。

**改動**：
- Migration `<ts>_create_confirm_invoice_rpc.sql`：PL/pgSQL — 取 invoice → upsert journal_entry（status=draft、voucher_no=NULL、`document_id = invoice.document_id`）→ replace lines。Idempotent。若 `invoice.document_id` 為 NULL（理論上不會發生,Phase 6 之後有 `NOT NULL` 約束保護）→ RAISE EXCEPTION fail loud。
- Migration `<ts>_create_confirm_allowance_rpc.sql`：**處理折讓 + Decision #13 鏡像邏輯**。流程：
  1. 取 allowance + 透過 `allowance.original_invoice_id` → invoices → `journal_entries WHERE document_id = invoices.document_id` → `journal_entry_lines` 取原 entry 之 lines
  2. 在 RPC 內以 PL/pgSQL 重現 `computeEntryFromAllowance` 之鏡像邏輯（抽角色 → 借貸對調 → 替換金額），或先在 JS 端組好 `ComputedEntry` 傳入 RPC 之 JSONB 參數（後者較簡單,允許 reuse Phase 4 純函式）
  3. Upsert journal_entry（status=draft）→ replace lines。Idempotent
  4. 若 `original_invoice_id` 為 NULL 或對應 entry 不存在 → **不**在 RPC 內 throw,而是由上游 service layer 偵測並引導 UI 請員工指定科目（合成 minimal `originalEntry` 後 retry）
- Migration `<ts>_create_regenerate_draft_entry_rpc.sql`：吃 `entity_type` + `entity_id`（invoice 或 allowance），要求對應 entry.status='draft' 否則 RAISE EXCEPTION。Lines wholesale DELETE + INSERT，header in-place UPDATE 保 entry.id（§5 重生策略）。**Allowance 之 regenerate 同樣需要重新 lookup 原 entry 並重跑鏡像邏輯**（因原 entry 可能在這段時間被 edit / reverse）
- `lib/services/invoice.ts::updateInvoice`：status 翻到 confirmed → `supabase.rpc('confirm_invoice')`；編輯 confirmed invoice 且 entry='draft' → `regenerate_draft_entry`
- `lib/services/allowance.ts`：**鏡像 invoice 的所有改動 + 多一步「原 entry 解析」**。dispatch 至 `confirm_allowance` 前,service layer 先：
  1. 嘗試解析 `original_invoice_id` → original entry
  2. 找到 → 直接呼叫 RPC（RPC 內部自行 lookup 並組鏡像）
  3. 找不到 → 觸發 UI「請指定費用 / 收入科目」對話框,員工指定後合成 minimal originalEntry 傳給 service 再夾帶進 RPC
- `components/allowance-review-dialog.tsx`：當 `original_invoice_id` 解析失敗時,顯示「請手動指定科目」區塊（費用/收入科目 dropdown + 結算科目 dropdown）;此區塊僅在 `original_invoice_id` 對應 entry 不存在時出現,正常 path 不增 friction

**驗證**：
- Integration tests `tests/integration/services/journal-entry-generation.test.ts`：
  - 確認新 invoice → draft entry + lines 正確（3 種樣板：進項可扣抵 / 不可扣抵 / 銷項）
  - **確認新 allowance → draft entry 鏡像原 entry 正確**（4 cases：原可扣抵 → 折讓 3 行 / 原不可扣抵 → 折讓 2 行 / 銷項折讓 3 行 / 原 entry 之科目曾被 staff 編輯 → 折讓追隨該編輯）
  - **`original_invoice_id` 找不到對應 entry → service 引導 UI 補科目;補完後 confirm 走 minimal originalEntry 路徑成功**
  - 編輯已 confirmed invoice（draft 已存在）→ entry.id 保留、lines 整批替換
  - 編輯已 confirmed allowance（draft 已存在）→ 同上,且**會 re-lookup 原 entry**（測試：原 entry 在折讓 confirm 後被 staff 改科目 → regenerate 折讓 → 折讓追隨新科目）
  - 編輯已 confirmed invoice / allowance 但 entry 已 posted → regenerate 拒絕
- 手動：confirm 一張 invoice → 對應產生 draft entry → 上傳一張對應之折讓 → confirm → 折讓 entry 之科目與原 invoice entry 完全一致（含結算渠道）

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
- **`lib/services/journal-entry-generation.ts` 強化**：editPostedEntry 開放後,staff 可將原 entry 之單一費用 / 收入 line 拆成多 lines（如 60% 銷管 / 40% 製造）。此時 `extractInputInvoiceRoles` / `extractOutputInvoiceRoles` 之 `.find(...)` 會 silently 撿第一個,導致折讓鏡像不平衡。改為 `.filter(...)` + 嚴格 `length === 1` 檢查;若 multi-expense 則 throw,caller 觸發「請手動指定折讓對應之科目」UI（§5.2.2 fallback 路徑同款）。see TODO comments in `extractInputInvoiceRoles` / `extractOutputInvoiceRoles`

**驗證**：
- Integration test：
  - editPostedEntry → audit_trails before snapshot 等於改前 row state
  - 連續多次 edit → 每筆 audit before = 前一筆 audit 的「after」（透過 getStateAfter 推導）—— **chain 完整性**
  - **Multi-expense 編輯 → 對應折讓 confirm/regenerate 觸發 "請手動指定" UI**（驗證 §5.2.2 fallback;此 case 唯一能由 Phase 9 之 edit RPC 產生）
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
- 發票同期作廢之**自動化連動沖銷**（§5.6 上半;v1 可手動標 `extracted_data.taxType='作廢'`,但 posted 分錄需員工手動建反向分錄）+ 跨期折讓自動產生（§5.6 下半）
- VAT 補申報流程
- duplicate detection（`duplicate_of` self-FK + `status='duplicate'`,v1 移除,誤上傳走 soft delete）
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

**新增 — Phase 5.5（documents-first row 建立）**：
- `supabase/migrations/<ts>_add_document_id_to_invoices_allowances.sql`
- `lib/services/document.ts`：`createDocument(data, options?)` server action
- `tests/integration/services/document.test.ts`、`invoice-create.test.ts`、`allowance-create.test.ts`

**新增 — Phase 5.6（storage 清理）**：
- `supabase/migrations/<ts>_create_documents_bucket.sql`
- 檔案搬遷腳本（`invoices` bucket → `documents` bucket，storage API copy）

**新增 — Phase 6 起**：
- `supabase/migrations/<ts>_backfill_documents_from_invoices_allowances.sql`（phase 6，**雙子表同步**）
- `supabase/migrations/<ts>_create_confirm_invoice_rpc.sql`（phase 7）
- `supabase/migrations/<ts>_create_confirm_allowance_rpc.sql`（phase 7，**鏡像 invoice 版**）
- `supabase/migrations/<ts>_create_regenerate_draft_entry_rpc.sql`（phase 7，吃 entity_type + entity_id）
- `supabase/migrations/<ts>_create_post_journal_entries_rpc.sql`（phase 8）
- `supabase/migrations/<ts>_create_edit_posted_entry_rpc.sql`（phase 9）
- `supabase/migrations/<ts>_create_reverse_entry_rpc.sql`（phase 10）
- `lib/services/fiscal-year-close.ts` + `fiscal-year-close/page.tsx`（phase 11）

> phase 7-10 的 `*_rpc.sql` 為原計畫寫法；Phase 6.5 引入 Drizzle 後改以 `lib/services/` 內的 `db.transaction()` 實作，詳見 Phase 6.5。

**新增 — Phase 6.5（Drizzle 交易層）**：
- `lib/db/drizzle.ts`（connection）、`lib/db/schema.ts`（`drizzle-kit pull` 產生）、`lib/db/rls.ts`（RLS helper）

**修改**：
- `lib/services/invoice.ts`（**phase 5.5 createInvoice 改 documents-first，對外行為不變**；phase 7 接 confirm/regenerate RPC、phase 9 派發至 editPostedEntry）
- `lib/services/allowance.ts`（**phase 5.5 / 7 / 9 全部鏡像 invoice 的改動**）
- `lib/services/invoice-import.ts`（**phase 6** `processElectronicInvoiceFile` 改 documents-first，upsert 前 idempotent 批次建 documents）
- `lib/domain/document.ts`（phase 5.5 加 `createDocumentSchema`）
- `tests/utils/supabase.ts`（phase 5 cleanup 加新表；**phase 5.5 修 `cleanupTestFixture` FK 刪除順序、補 allowances**）
- **Storage（phase 5.6）**：建 `documents` bucket、搬遷既有檔案、改 key 路徑為 `/{firmId}/{clientId}/{periodYYYMM}/`、替換所有 `supabase.storage.from('invoices')` 呼叫點（上傳點、download / delete / signed URL、`extraction-worker`），extraction-worker 重新部署。詳見 Phase 5.6
- `lib/data/accounts.ts`（phase 4 加 extractAccountCode + 格式 lint）
- `lib/domain/models.ts`（每階段相應 schema）
- `components/invoice-review-dialog.tsx`（phase 2 加 reason 欄位 + 警示條外觀；phase 9 真接 editPostedEntry）
- `components/allowance-review-dialog.tsx`（**phase 2 / phase 9 鏡像 invoice review dialog**）
- `components/firm-sidebar.tsx`（phase 2 / 3 / 11 入口）
- `app/firm/[firmId]/client/[clientId]/period/[periodYYYMM]/page.tsx`（phase 2 在 invoice + allowance 兩處都加「已產生 draft 傳票」連結）
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
