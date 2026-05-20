# 憑證 / 報表 — DB Reads 切換計畫（Phase 5 後半）

> **狀態**：草稿，待實作。實作時機 —— 等 DB 內有真實 entries（Phase 7 `confirm_invoice` 之後）再動手，目前空表切過去只會看到「尚無資料」，無從驗證 UX。
>
> **配套文件**：
> - [`VOUCHER_JOURNAL_ENTRY_PLAN.md`](./VOUCHER_JOURNAL_ENTRY_PLAN.md) — 設計提案（Decisions #1–#13）
> - [`VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md`](./VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md) — 階段式計畫

## Context

原 Phase 5 計畫是「schema 落地 **+** UI 切換到真實 DB」一起做。實作後 review 發現 UI 切換的部分被 Phase 1 的 in-memory demo store 形狀拖著走：

- `useVoucherStore` 把整個 client 的 entries / lines / documents / auditTrails 全抓進記憶體，UI 自己 filter / sort / paginate —— 這是 demo store 的形狀，不是 production query 形狀。
- `lib/services/{document,journal-entry,audit-trail}.ts` 開了一個新 pattern（把 `SupabaseClient` 當參數傳入、query 無 `.limit()` / 無分頁），與既有 `lib/services/*.ts`（`'use server'` + 內部建 client）不一致；且「可注入 client 以利測試」的好處並未實現，因為本專案的 integration test 不走 service layer，直接用 admin client 打 Supabase。

因此 Phase 5 拆成兩段：

1. **已合併（PR #187）**：schema 落地 —— 6 張表 + RLS + 19 個 schema integration test + domain enum 收斂。UI 不動，續用 demo store。
2. **本計畫**：UI 從 demo store 切換到真實 Supabase 讀取，用 production 形狀、貼合既有 codebase convention 的 API 重新設計。

## Scope

**In：**
- IS / BS / 科目明細三張報表頁切到 server-side 過濾的 DB 讀取
- 傳票列表 / 傳票詳情兩頁切到分頁 + 過濾的 DB 讀取
- demo flow 整套搬到 `/dev/*` 路由（續用 demo store，保留 UX 迭代能力）
- 對應 integration tests

**Out（屬 Phase 7–10）：**
- 所有 mutation（draft 存檔 / 批次過帳 / posted edit / 沖銷）。Production 頁面在 Phase 7 `confirm_invoice` 把資料寫進 DB 前都會是空的；mutation 按鈕在 DB flow 維持 disabled。
- 真正的 SQL `GROUP BY` 聚合（見「聚合策略」一節）。

## 已敲定的決策

1. **demo flow 移到 `/dev/*`**：不在 production 頁面用 `?demo=1` 分支。Demo store + generator 保留，由 `/dev/*` 頁面獨佔使用。
2. **dialogs：DB flow dormant、demo flow active**。`voucher-edit-dialog` / `voucher-batch-post-dialog` / `voucher-reverse-dialog` 仍與 demo store 綁定，只被 `/dev/*` 頁面實際開啟。Production 頁面渲染這些動作按鈕但維持 **disabled**（UI 結構完整可 review，功能待 Phase 7 接 RPC / Drizzle）。
3. **不引入 entry ↔ line denormalization**（沿用 PR #187 決策；trigger 見 phased plan）。

## 架構：東西放哪、為什麼

本專案讀取路徑有兩種既有 convention，**依資料量形狀選用**：

| Convention | 既有範例 | 適用 |
|---|---|---|
| Hook 內直接用 browser client 查詢（SWR fetcher 內 `supabase.from(...)`） | `hooks/use-paginated-period-invoices.ts` | 「頁面本身就是那些 row」的清單 —— row 反正要送到 client，server action 包一層沒有意義 |
| `'use server'` service action（內部建 server client） | `lib/services/reports.ts`、`lib/services/invoice.ts` | 重活在 server 做、只把精簡結果送過線；或多步驟 / 報表生成 |

**套用：**
- **傳票列表 / 詳情** → hook 內 browser client 直查（row 本來就要到 client）。**不**新增 `lib/services/journal-entry.ts`。
- **IS / BS / 科目明細** → `'use server'` action。報表 query 是 JOIN 撈一堆 line row 做聚合，server 端做完只送精簡結果（IS/BS ~20 列）過線 —— 這是真實效率差異。

> **不採用**「把 `SupabaseClient` 當參數傳入」的 isomorphic pattern —— 它偏離既有 convention，且本專案 integration test 不走 service layer（直接 admin client），所謂可測試性好處不存在。

## 查詢層設計

### 傳票列表 —— `hooks/use-voucher-list.ts`（新）

沿用 `usePaginatedPeriodInvoices` 形狀。**單一查詢**，靠 PostgREST embedding 一次帶回 lines 與 document：

```ts
supabase
  .from("journal_entries")
  .select(
    "*, journal_entry_lines(debit, credit), documents(doc_type)",
    { count: "exact" },
  )
  .eq("client_id", clientId)
  // 過濾：status / entry_date 範圍 / 關鍵字
  .order("entry_date", { ascending: false })
  .order("created_at", { ascending: false })
  .range(start, end);
```

- 借/貸總額：對 embedded `journal_entry_lines` 在 JS 內 `sumLines`（每頁 ~50 entries × ~3 lines，量極小）。
- `docType` 過濾：用 embedded filter（`documents!inner(...)` + `.eq("documents.doc_type", v)`）；`system`（無原始憑證）→ `.is("document_id", null)`。
- `keyword`：`.or("voucher_no.ilike.%kw%,description.ilike.%kw%")`。
- Server-side 分頁（`.range`）取代目前的 client-side `slice`。

回傳 `{ items, count }`，`items` 每筆含 `entry` + `docType` + `debitTotal` / `creditTotal`。

### 傳票詳情 —— `hooks/use-voucher-detail.ts`（新）

SWR fetcher 內數筆查詢（entry 先、其餘平行）：

```ts
// 1. entry + lines + document（embedding 一次帶回）
.from("journal_entries")
.select("*, journal_entry_lines(*), documents(*)")
.eq("id", entryId).single()

// 2. 平行：audit 歷史
.from("audit_trails")
.select("*")
.eq("entity_table", "journal_entries").eq("entity_id", entryId)
.order("actor_at", { ascending: false })

// 3. 平行：沖銷雙向連結
.from("journal_entries").select("id, voucher_no").eq("reverses_entry_id", entryId)  // 沖銷本筆的分錄
// 本筆若是沖銷分錄，reverses_entry_id 已在 (1) 帶回 → 再查目標 entry
```

### 報表 —— `lib/services/financial-reports.ts`（新，`'use server'`）

`lib/services/financial-statements.ts` 維持**純函式**（被 client component 與單元測試 import；不能加 `'use server'`，否則整檔變 server actions）。新檔 `financial-reports.ts` 放 DB-backed 版本：

```ts
"use server";

export async function getIncomeStatementFromDb(
  clientId: string, fromDate: string, toDate: string,
): Promise<IncomeStatement>;

export async function getBalanceSheetFromDb(
  clientId: string, asOfDate: string,
): Promise<BalanceSheet>;

export async function getAccountLedgerFromDb(
  clientId: string, accountCode: string, asOfDate: string,
): Promise<AccountLedger>;
```

每支的實作模式相同 —— **server 端做過濾撈取，再餵給既有純函式**：

```ts
// 撈取「已過濾」的 lines（不是整個 client）：embedded inner-join 把過濾推到 server
const { data } = await supabase
  .from("journal_entry_lines")
  .select("*, journal_entries!inner(client_id, status, entry_date)")
  .eq("journal_entries.client_id", clientId)
  .neq("journal_entries.status", "draft")
  .gte("journal_entries.entry_date", fromDate)   // IS：BETWEEN；BS / ledger：<= asOfDate
  .lte("journal_entries.entry_date", toDate);
// → 餵給既有 computeIncomeStatement / computeBalanceSheet / getAccountLedger
```

- IS / BS / ledger 的計算邏輯（首碼分類、自然方向、合成 3440、running balance）**完全沿用** `financial-statements.ts` 的純函式 —— 已被單元測試覆蓋，不重寫。
- BS 的合成 3440（全期 IS）由 `computeBalanceSheet` 內部用同一份 totals 算出，故 `getBalanceSheetFromDb` 只需一次 `entry_date <= asOfDate` 的撈取。

### Hooks for 報表

`hooks/use-income-statement.ts` / `use-balance-sheet.ts` / `use-account-ledger.ts` —— 各自 `useSWR` 包一支對應的 `'use server'` action，回傳 `{ data, isLoading }`。

## 聚合策略（誠實揭露的取捨）

理想 production 形狀是 SQL `GROUP BY`（`SELECT account_code, SUM(debit), SUM(credit) ... GROUP BY account_code`，只回 ~20 列）。本計畫**暫不**這麼做：

- `feedback_avoid_rpc`：不寫 PL/pgSQL RPC。
- PostgREST 跨表 `GROUP BY` 聚合不是一等公民（單表 aggregate 可以，跨 JOIN 的 group 不行）。
- 真正的 server-side 聚合等 Drizzle ORM 進場，或先補一個 SQL VIEW 再用 PostgREST aggregate。

**本計畫的折衷**：service action 在 server 端做**過濾撈取**（靠 embedded inner-join，只回符合 `client_id / status / 日期` 的 line row），再在 server 端的 JS 聚合，只把精簡的 `IncomeStatement` 送過線。

- 比 demo store 的「整個 client 全抓」好 —— 撈取已過濾。
- 比 SQL `GROUP BY` 差 —— 單一 client 一年 ~10k line row 仍會整批過 server 記憶體。
- 在 Drizzle 進場 / 或效能真的咬人前，這是合理中間態。實作時於 `financial-reports.ts` 檔頭註記此上界。

## Production 頁面改動

`app/firm/[firmId]/client/[clientId]/` 下五頁：

- `voucher/page.tsx` → `useVoucherList`
- `voucher/[entryId]/page.tsx` → `useVoucherDetail`
- `reports/income-statement/page.tsx` → `useIncomeStatement`
- `reports/balance-sheet/page.tsx` → `useBalanceSheet`
- `reports/account/[accountCode]/page.tsx` → `useAccountLedger`

每頁：

- 移除 `useVoucherDemoStore` / `seedVoucherDemoFor` / `?demo=1` 分支 / 「示範資料」badge。
- 改呼叫該頁的 hook。
- 過濾 / 分頁 state 盡量移到 URL query param（列表頁的 status / 日期 / 關鍵字 / page），讓 server-side 過濾與可分享連結一致。
- Mutation 按鈕（編輯 / 過帳 / 沖銷 / 批次過帳）渲染但 **disabled**，tooltip 註明「Phase 7 後開放」。Dialogs 在 DB flow 不接線。
- 空資料狀態：沿用既有「尚無資料」（Phase 7 前預期為空）。

## `/dev/*` Demo 頁面

把目前這五頁（續用 demo store 的版本）整套搬到 `/dev` 區，作為 UX 迭代沙盒。

- **路由**：建議 `app/firm/[firmId]/client/[clientId]/dev/{voucher,voucher/[entryId],reports/...}/` —— 保留 firm layout（sidebar）與 `firmId`/`clientId` route param，內部連結只多一段 `/dev`，搬遷 churn 最小。
  - 替代方案：top-level `app/dev/*`，firm/client-agnostic、demo generator 用合成 ID —— 但失去 firm layout，且 `proxy.ts` 要加 public/auth 處理。**傾向不採用**。
- **production 關閉**：`/dev/*` 頁面在 `process.env.NODE_ENV === 'production'` 時 `notFound()`（或限 super_admin）。避免假資料外流。
- Demo 頁面續用 `useVoucherDemoStore` + `seedVoucherDemoFor`，dialogs 全功能可玩。
- `firm-sidebar.tsx`：傳票 / 報表入口指向 production 路由；`/dev` 入口（若需要）僅 dev 模式顯示。

## 測試

- **報表 service**：`lib/services/financial-reports.test.ts`（新）—— integration test，用 admin client seed entries + lines（涵蓋 posted / reversed / draft、跨日期），呼叫三支 `*FromDb`，斷言過濾與聚合正確。對照既有 `tests/integration/services/reports.test.ts` 形狀。
- **傳票列表 / 詳情**：hook 內查詢的 integration test —— seed 後驗證分頁、status / 日期 / 關鍵字 / docType 過濾、借貸總額、沖銷雙向連結。
- **純函式不動**：`financial-statements.test.ts` 既有單元測試續綠（`financial-reports.ts` 直接重用這些純函式，等於再被 integration test 覆蓋一次）。
- `tests/fixtures/voucher-demo-generator.ts` 保留供 `/dev` 頁面與既有單元測試使用。

## PR 切分

建議切兩個 PR（兩塊形狀差異大、reviewer 聚焦不同）：

1. **PR A — 報表**：`financial-reports.ts` + 3 個報表 hook + 3 頁切換 + service 測試。
2. **PR B — 傳票**：`use-voucher-list` / `use-voucher-detail` + 2 頁切換 + `/dev/*` 搬遷 + dialog disabled 處理 + 測試。

`/dev/*` 搬遷放 PR B（與傳票頁一起搬，連結改動集中）。也可合成單一 PR，但兩塊各自完整、可獨立 review / 上線。

## 關鍵檔案 reference

**新增：**
- `lib/services/financial-reports.ts`（`'use server'`；DB-backed IS / BS / ledger）
- `hooks/use-voucher-list.ts`、`use-voucher-detail.ts`
- `hooks/use-income-statement.ts`、`use-balance-sheet.ts`、`use-account-ledger.ts`
- `lib/services/financial-reports.test.ts`、傳票 hook 的 integration test
- `app/firm/[firmId]/client/[clientId]/dev/...`（demo 頁面搬遷目的地）

**修改：**
- 五個 production 頁面（移除 demo store、接 hook、mutation 按鈕 disabled）
- `components/firm-sidebar.tsx`（入口指向 production；`/dev` 入口僅 dev 顯示）

**刪除 / 搬遷：**
- 五頁的 demo-store 版本 → 搬到 `/dev/*`

**保留不動：**
- `lib/dev/use-voucher-demo-store.ts`、`tests/fixtures/voucher-demo-generator.ts`（`/dev` 與單元測試用）
- `lib/services/financial-statements.ts` 純函式
- `components/voucher-{edit,batch-post,reverse}-dialog.tsx`、`voucher-audit-history.tsx`（demo flow 用；DB flow Phase 7 再接）

## 待確認的決策點

1. **`/dev/*` 路由位置**：nested（`.../client/[clientId]/dev/...`，保留 firm layout）vs top-level（`app/dev/*`，firm-agnostic）。計畫傾向 nested。
2. **Mutation 按鈕在 DB flow**：disabled 可見（UI 結構完整）vs 完全隱藏。計畫傾向 disabled 可見。
3. **PR 切分**：兩個 PR（報表 / 傳票）vs 單一 PR。計畫傾向兩個。
