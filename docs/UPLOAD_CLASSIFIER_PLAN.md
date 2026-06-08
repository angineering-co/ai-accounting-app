# 上傳分類器 (Upload Classifier)：設計與實作計畫

> **狀態**：設計定案，待實作。
> **v1 定位**：**事務所端內部工具**。分類器在每筆人工上傳時於背景執行、靜默標註，
> **只有事務所員工會對結果採取行動**；客戶不被要求處理分類結果（開放給客戶為後續
> 階段，依準確度數據解鎖，見 §7）。客戶端唯一的新增是多一個「其他文件」上傳選項。

## 1. 目的與定位

`in_or_out`（進項 / 銷項）上傳時錯選會讓 TET_U 申報資料出錯，法律風險不可忽視。
根因是 `lib/services/gemini.ts` 的擷取 prompt 把 buyer/seller 映射綁死在使用者上傳時
選的 `in_or_out`，與文件實際內容無關，因此事後「buyer.tax_id 是否等於 client.tax_id」
的校驗永遠一致，抓不到分類錯誤。

分類器是**獨立於擷取的另一個 job**，用中立 prompt 只看文件本身、報告所見的
`doc_type` + `in_or_out`，與使用者的選擇比對，把不一致標在 `documents.classifier_hint`。

**為何 v1 只給事務所用**：
- 客戶對「要自己處理分類」有明確反彈；要求他們判讀進銷項本就是把會計工作外推。
- 符合「會計師把關、AI 為內部優化」的定位（memory `feedback_ai_messaging_positioning`）。
- 分類器**從第一天就對每筆上傳執行**（即使客戶看不到），這些資料加上事務所的人工
  修正，正是日後判斷「何時能安全開放給客戶」所需的標註數據（§7 rollout gate）。

## 2. 範圍

**v1 範圍內**：
- 每筆人工上傳後**非阻擋、平行**執行的分類器（獨立 pgmq queue / worker，與 extraction-worker 分離）
- `documents.classifier_hint` JSONB 欄位 + partial index
- **事務所端**處理動作：`keep` / `switchInOrOut` / `convertDocType` / `demoteToOther` / `promoteFromOther`
- 事務所端 per-period 待確認檢查點（期別頁）+ 審核 dialog 不符旗標
- 「其他文件」上傳選項（客戶與事務所皆可用；建 childless `other` document、跳過 OCR）
- `/documents` 列表頁：**客戶端**＝瀏覽 + 刪除自己的文件；**事務所端**＝瀏覽 + 刪除 + promote
- 信心分級（high-confidence 且一致才靜默；中 / 低信心也標 pending 供事務所複核）
- Eval harness scaffold

**v1 範圍外**：
- **任何客戶端的分類校正 UI**：客戶看不到分類結果（無佇列、無提示、無徽章）。開放給客戶
  自我校正是後續階段，依 §7 準確度數據解鎖。
- 修改擷取 prompt 本身。
- 任何上傳阻擋（hard / soft block）或上傳當下的同步 dialog。
- 事務所層**跨客戶**彙整佇列（firm-wide console）；v1 事務所經各期別的 per-period 檢查點。
- 免上傳分類選擇（classifier-first / no-pick）流程（見 §12）。
- `promote` 時由日期**自動推導期別**：v1 一律手動指定。
- 電子發票匯入：`processElectronicInvoiceFile` 寫入政府來源的可信 row、無人工 in/out 猜測，
  不經上傳處理常式、不 enqueue 分類。分類器只服務人工上傳。

## 3. 流程設計

**核心模型**：上傳當下**樂觀地 (optimistic)** 依使用者選擇建好 document + 子表（沿用現行
`createInvoice` / `createAllowance` 不變），使用者立刻在期別頁看到 invoice / allowance。
分類器是**事後平行跑的獨立 job**，只**標註** `classifier_hint`，本身**不建、不刪子表**。
所有路由 / 拆解動作由**事務所員工**事後在檢查點 / `/documents` 觸發。

```
使用者拖放 1–10 份檔案 + 選擇分類 (發票 / 折讓 / 其他文件)
        │
        ▼
所有檔案平行 Storage upload (documents bucket)
        │
        ├─ 發票 / 折讓 ─▶ createInvoice / createAllowance (現行不變)
        │                一個交易內建 documents 父 row + 子表 row，子表 status='uploaded'
        │
        └─ 其他文件 ───▶ createDocument (doc_type='other')，無子表、OCR 略過 (childless)
        │
        ▼
上傳完成，使用者立刻在期別頁看到發票 / 折讓並照常作業。
        │
        ▼
[非阻擋] 上傳處理常式呼叫 enqueueClassification([...documentIds])
        │
        ▼
classification-worker (獨立 queue / worker)：
   下載原檔 → classifyDocument(file, clientInfo) → 比對 verdict vs 子表現況
   → UPDATE documents.classifier_hint：
        高信心且一致         → 不設 review_status（靜默）
        invoice/allowance 不一致 或 中/低信心 → review_status='pending'
        其他文件被判像 VAT (反向檢查)         → disagreed=true、不設 pending（§5.6）
        失敗                 → 寫 error、不設 pending
   worker 全程不碰子表
        │
        ▼
事務所員工處理（客戶看不到任何分類結果）：
   - 期別頁「分類待確認」檢查點：該期別 review_status='pending' 的發票 / 折讓 (§6.4)
   - /documents：doc_type='other'，含反向檢查 chip 可 promote (§6.3)
   - 審核 dialog 頂端的不符旗標 (§6.5)
```

> **關鍵不變式**：文件的核心生命週期（子表、OCR、期別頁可見、confirm、報表、分錄）
> **完全不依賴分類器是否跑完**。分類器掛了 / 延遲 / outage 時，文件就跟「沒有分類器」
> 一樣照使用者選擇走完流程；分類器只「額外」標註不一致。

**為何分類器是獨立 async job**：
- **延遲穩健**：Gemini 延遲可能達 8–10s；做成上傳阻擋不值得（這只是軟性建議）。非阻擋
  讓延遲完全隱形。
- **故障域隔離**：分類（中立 prompt）與擷取（被 `in_or_out` 帶偏）是不同關注點，獨立
  queue / worker 讓彼此 outage 互不影響。**不**與 extraction-worker 共用。
- **enqueue 時點**：上傳當下即 enqueue（document 建立後一次性 batch），不等期別批次。

**故障處理**：單檔分類失敗 → 寫 `classifier_hint.error`、不設 pending、文件照走（靜默通過）。
全部失敗（outage）同樣全放行，不因 Gemini 停擺卡住上傳。worker retry / dead-letter 沿用
pgmq 既有機制。

## 4. 資料層

### 4.1 Schema 變更（單一新欄位 + 一個 partial index）

```sql
-- supabase/migrations/<ts>_add_classifier_hint_to_documents.sql
ALTER TABLE documents ADD COLUMN classifier_hint JSONB;
COMMENT ON COLUMN documents.classifier_hint IS
  '分類器判決與處理狀態; 形狀詳見 docs/UPLOAD_CLASSIFIER_PLAN.md §4.2';

-- per-period 檢查點 / 計數用 partial index（只索引待處理的 active 文件，極小）
CREATE INDEX idx_documents_pending_classification
  ON documents (client_id)
  WHERE classifier_hint->>'review_status' = 'pending' AND status = 'active';
```

> **無需其他 schema 變更**：`doc_type` 已是 `invoice / allowance / other`；childless `other`
> document 已合法（`invoices/allowances.document_id NOT NULL UNIQUE` 是子表→父表方向，不強制
> 父表有子）。Phase 6b 的 orphan 偵測已 scope 在 `doc_type IN ('invoice','allowance')`，`other`
> 天然排除；只需容忍 convert / demote 交易內**極短暫**的 childless 中間態。

依 memory `feedback_no_apply_migration`：寫好 .sql 後不自動 migrate / 不自動 regenerate types。

### 4.2 JSONB 形狀

```ts
{
  // verdict (classifier 產出)
  doc_type: 'invoice' | 'allowance' | 'other',
  in_or_out: 'in' | 'out' | null,
  voided: boolean,                       // 偵測到作廢章 / 紅色浮水印 / 「作廢」字樣
  confidence: 'low' | 'medium' | 'high',

  // 比對結果 (worker 落庫時算出)
  disagreed: boolean,                    // verdict 的 (doc_type, in_or_out) ≠ 子表現況
  low_confidence: boolean,               // confidence ∈ {low, medium}

  // 處理狀態
  review_status?: 'pending' | 'resolved',
  resolution?: 'kept' | 'switched_in_out' | 'converted' | 'demoted' | 'promoted',
  resolved_at?: string,

  // metadata
  model: string,                         // 例 'gemini-2.5-flash-lite'
  classified_at: string,
  error?: string,                        // 失敗時填入; 此時 verdict 無意義
}
```

> `review_status='pending'`（→ 進 per-period 檢查點）僅當 invoice/allowance 子表
> `disagreed || low_confidence`。其他文件被反向檢查判像 VAT 時只設 `disagreed=true`、
> **不**設 pending（childless 無期別，本就進不了 per-period 檢查點），改由 `/documents`
> 的 chip 呈現（§5.6）。`classifier_hint.doc_type` 為 audit 紀錄；`documents.doc_type`
> 才是 authoritative。

### 4.3 Zod schema

`lib/domain/document.ts`：新增 `classifierHintSchema`，加進 document row schema
（`classifier_hint: classifierHintSchema.nullable().optional()`）。

## 5. 服務層

### 5.1 純函式：`classifyDocument`

新檔 `lib/services/document-classifier.ts`，風格沿用 `lib/services/gemini.ts`：原生 `fetch()`、
`inline_data` + base64、MIME allowlist 一致、`response_mime_type: application/json`、
`JSON.parse` 後**加一道 Zod parse**（對小模型的便宜防呆）。

```ts
export const CLASSIFIER_MODEL = 'gemini-2.5-flash-lite';

export interface ClassifyDocumentArgs {
  fileData: ArrayBuffer;
  mimeType: string;
  clientInfo: { name: string; taxId: string };
}
export interface DocumentClassification {
  docType: 'invoice' | 'allowance' | 'other';
  inOrOut: 'in' | 'out' | null;
  voided: boolean;
  confidence: 'low' | 'medium' | 'high';
}
export async function classifyDocument(args: ClassifyDocumentArgs): Promise<DocumentClassification>;
```

**Prompt 原則**：中立，不接受任何預先宣告的 `in_or_out`。找出 seller/buyer tax_id 與
`clientInfo.taxId` 比對：seller==client → `out`、buyer==client → `in`、皆不符 → `null` 且
`confidence` 不高於 `low`。偵測作廢。要求 JSON only。

**檔案大小**：Gemini `inline_data` 上限 20MB（base64 放大約 33%，原始檔約 > 15MB 即被拒）。
影像 > 15MB 先 server-side 縮放（長邊 ≤ 2048px、`sharp`）；PDF 取第 1 頁（`pdf-lib`）；
其餘超限 → `error: 'file_too_large'` 走靜默通過。僅分類器路徑降採樣，擷取 worker 仍讀原檔。

### 5.2 Enqueue：`enqueueClassification`（上傳處理常式呼叫）

```ts
export async function enqueueClassification(documentIds: string[]): Promise<void>;
```
沿用 `lib/services/bulk-extraction.ts` 的 pgmq 模式（`pgmq_public.send_batch`），送進**獨立的
`document_classification` queue**。**`createInvoice` / `createAllowance` 完全不改**；上傳處理常式
在 row 建立後收集 `document_id` 一次性 batch enqueue。direct-other 同樣 enqueue（反向檢查，§5.6）。

### 5.3 Worker：`classification-worker`

新檔 `supabase/functions/classification-worker/`（Deno edge function，鏡像 extraction-worker：
pgmq read、download、Gemini、回寫、retry / dead-letter），**獨立部署**。每筆：dequeue → 讀
document（`file_url` / `doc_type` / `client_id`；有子表則讀 `in_or_out`）→ 下載原檔 → 取 client
name + tax_id → `classifyDocument()` → 算 `disagreed` / `low_confidence` → `UPDATE documents
SET classifier_hint`（含 `review_status`）。**worker 永遠不碰子表。**

### 5.4 處理動作（事務所端，對既有 row 的 mutation）

新增於 `lib/services/document.ts`（Drizzle 交易，Phase 6.5 後可用；非 PostgREST RPC，遵循 memory
`feedback_avoid_rpc`）。每個動作完成後設 `review_status='resolved'` + 對應 `resolution`。
**v1 全部限事務所端**（客戶不對分類結果採取行動）。

| 動作 | 機制 |
|---|---|
| `resolveClassificationKeep` | 僅標 resolved；`disagreed` 紀錄保留供 audit |
| `switchInOrOut` | 子表 `in_or_out` 欄位 update |
| `convertDocType` (invoice↔allowance) | 交易內：刪原子表 + 建目標子表（不同 schema）+ 翻 `doc_type` |
| `demoteToOther` | 交易內：刪子表 + 翻 `doc_type='other'` |
| `promoteFromOther` | 交易內：建子表（**手動指定期別**）+ 翻 `doc_type`（demote 的反向）|

```ts
export async function resolveClassificationKeep(documentId: string): Promise<void>;
export async function switchInOrOut(documentId: string): Promise<void>;
export async function convertDocType(
  documentId: string,
  target: { docType: 'invoice' | 'allowance'; inOrOut: 'in' | 'out' },
): Promise<void>;
export async function demoteToOther(documentId: string): Promise<void>;
export async function promoteFromOther(
  documentId: string,
  target: { docType: 'invoice' | 'allowance'; inOrOut: 'in' | 'out'; taxFilingPeriodId: string },
): Promise<void>;
```

- **期別手動指定（不 auto-derive）**：`other` 無期別、OCR 又被略過故無可信日期；promote 時
  由事務所人員手動選期別。v1 刻意不自動推導（最佳做法未定）。
- **OCR 重跑**：擷取 prompt 被 `in_or_out` 帶偏，故 `switchInOrOut` / `convertDocType` 若在 OCR
  之後才執行，需 `ocr_status='pending'` 重新擷取。`convertDocType` 一律以「建全新目標子表 +
  重新擷取」處理（不搬移 `extracted_data`）。
- **Guard**：要求子表尚未 confirmed 且無對應 journal entry；否則擋下。

### 5.5 read helper

```ts
export async function getPeriodPendingClassifications(periodId: string): Promise<...[]>;
```
經子表 `tax_filing_period_id = periodId` 關聯 `documents`，篩 `review_status='pending'` 且
`status='active'`（走 §4.1 index）。供 §6.4 檢查點。childless `other` 無期別，天然不在此查詢。

### 5.6 「其他文件」上傳 + 反向檢查

客戶或事務所確定一份文件不是發票 / 折讓時，於上傳選「其他文件」→ 呼叫既有 `createDocument`
→ 建 childless `doc_type='other'` row（無子表、OCR 略過）。此為唯一真正用到 standalone
document-first 建立的路徑。

**反向檢查（預設開啟）**：對 direct-other 同樣 enqueue 分類器，捕捉「標其他文件、但其實是
統一發票 / 折讓單」的高風險錯誤（誤標的真發票會靜默跳過 OCR、永不進稅務資料）。不一致時
worker 寫 `disagreed=true`（**不**設 pending），由事務所 `/documents` 的 chip 呈現可 promote。
客戶端不顯示此訊號。

## 6. UI 層（事務所端為主）

字級依專案規約：`text-base` 為主、`text-sm` 為輔、禁用 `text-xs`。

### 6.1 上傳入口：第三個選項「其他文件」

3 個上傳入口（`components/document-upload-section.tsx`、`components/invoice/invoice-upload-dialog.tsx`、
portal FAB parent）的分類選擇加上「其他文件」。選發票 / 折讓 → 現行 `createInvoice` / `createAllowance`；
選其他文件 → `createDocument`。上傳處理常式在 row 建立後一次性呼叫 `enqueueClassification`。

### 6.2 客戶端 `/documents`：瀏覽 + 刪除（無分類結果）

新檔 `app/firm/[firmId]/client/[clientId]/documents/page.tsx`，列該 client `doc_type='other'`
文件。**客戶端 (portal)**：只見縮圖、檔名、`doc_date`、**刪除**（soft delete + 清 storage）。
**不顯示任何 classifier_hint**（verdict / chip / 徽章皆無）、**無 promote**。本頁對客戶的意義
就是「除發票 / 折讓外多一個丟其他文件的地方，並能檢視 / 刪除自己丟的」。

### 6.3 事務所端 `/documents`：完整管理

同一頁、firm 角色 render 完整動作：縮圖、檔名、`doc_date`、`classifier_hint` 摘要、操作。
- **操作**：刪除、`promoteFromOther`（重分類為發票 / 折讓，**手動指定 in/out 與期別**、觸發 OCR）。
- **反向檢查 chip**：`disagreed=true` 且 verdict 為 invoice/allowance 的列顯示「看起來像發票 /
  折讓，要轉嗎？」→ 點擊走 `promoteFromOther`。這是誤標為 `other` 的真發票的主要修正點。
- 排序 `created_at DESC`；分頁沿用 `usePaginatedPeriodInvoices` 模式。

### 6.4 事務所端 per-period 分類待確認檢查點（主要處理介面）

新檔 `components/period-classification-review.tsx`，掛在期別頁、緊鄰 Phase 7 的
`components/period-voucher-generation.tsx`。
- 徽章「分類待確認：N」＝該期別 `review_status='pending'` 的發票 / 折讓數（`getPeriodPendingClassifications`）。
- 展開為清單，每筆提供 §5.4 動作（switch / convert / demote / keep）。
- **這是事務所處理 invoice/allowance 分類不一致的主要介面**；申報前的自然 QA 時點。
- **periodless `other` 盲區提醒（粗粒度）**：本檢查點經子表期別關聯，看不到無子表的 `other`
  （含誤標為 `other` 的真發票）。故旁邊另顯一條客戶層級粗提醒「本客戶有 N 份其他文件
  （含 M 份疑似發票），申報前建議檢視」連到 `/documents`。

> **已知 v1 限制**：事務所無跨客戶的全域待辦視圖；要逐期別 / 逐客戶查看（per-period 檢查點 +
> `/documents`）。跨客戶 console 留待 firm-wide（§12）。

### 6.5 審核 dialog 不符旗標

`invoice-review-dialog.tsx` / `allowance-review-dialog.tsx`：當對應 document 的
`classifier_hint.disagreed === true`，於表單頂端渲染 inline `Alert`（提示但不警示）：
「上傳時系統判斷此文件為 X，但選擇為 Y，請於確認前再次核對。」僅資訊性、不阻擋。

## 7. Eval Harness 與開放客戶的 rollout gate

分類器從第一天對每筆上傳執行，事務所的人工修正（switch / convert / demote / promote）即是對
verdict 的**人工標註**。這條標註流是日後「能否開放給客戶自我校正」的依據。

**Eval scaffold（新檔）**：
- `tests/fixtures/classifier/{README.md, manifest.json, .gitignore}`：收樣指引 + ground truth manifest（起始 `[]`）。
- `tests/integration/document-classifier.eval.ts`：讀 manifest、逐檔跑 `classifyDocument()`、算
  per-class precision/recall + 整體準確率；**manifest 空時 skip**。
- `lib/services/document-classifier.test.ts`：parsing 層單元測試（mock fetch、Zod、錯誤路徑）。

**Rollout gate**：以 eval + 線上不符 / 修正率衡量；特別看 `in_or_out`（最高風險）的**高信心
誤判率**與**信心校準**。達標後才進 §12 的客戶開放階段。

## 8. 改動清單一覽

| 檔案 | 改動 |
|---|---|
| `supabase/migrations/<ts>_add_classifier_hint_to_documents.sql` | NEW — JSONB 欄位 + partial index |
| `supabase/migrations/<ts>_create_classification_queue.sql` | NEW — pgmq `document_classification` queue |
| `supabase/database.types.ts` | regenerate（使用者執行）|
| `lib/domain/document.ts` | 加 `classifierHintSchema` + 擴充 document schema |
| `lib/services/document-classifier.ts` | NEW — `classifyDocument` + `enqueueClassification` |
| `lib/services/document-classifier.test.ts` | NEW — 單元測試 |
| `supabase/functions/classification-worker/` | NEW — 獨立 pgmq worker |
| `lib/services/document.ts` | 加 `resolveClassificationKeep` / `switchInOrOut` / `convertDocType` / `demoteToOther` / `promoteFromOther`（皆事務所端，Drizzle 交易）+ `getPeriodPendingClassifications` |
| `components/document-upload-section.tsx` / `components/invoice/invoice-upload-dialog.tsx` / portal upload parent | 加「其他文件」選項 + 上傳後 `enqueueClassification` |
| `app/firm/[firmId]/client/[clientId]/documents/page.tsx` | NEW —「其他文件」列表（client：瀏覽+刪除；firm：+ classifier 摘要 / chip / promote）|
| `components/period-classification-review.tsx` | NEW — per-period 檢查點 + periodless `other` 粗提醒 + 期別頁掛載 |
| `components/portal-sidebar.tsx` / `components/firm-sidebar.tsx` | 加「其他文件」入口 + 徽章（doc_type='other' 數）|
| `components/invoice-review-dialog.tsx` / `components/allowance-review-dialog.tsx` | 顯示 `disagreed` 旗標 |
| `tests/fixtures/classifier/*` + `tests/integration/document-classifier.eval.ts` | NEW — eval scaffolding |

> **`createInvoice` / `createAllowance` 不改**：optimistic 模型下其建立邏輯完全不變。
> **無客戶端分類 UI**（無佇列元件、無客戶端徽章 / chip）—— 留待 §12 客戶開放階段。

## 9. Reuse 既有

- Gemini fetch / MIME allowlist / base64（`lib/services/gemini.ts`）
- pgmq enqueue（`lib/services/bulk-extraction.ts`）；worker 結構 + `documents` bucket 下載 + `toDocumentsKey`（`supabase/functions/extraction-worker/`）
- Drizzle 交易（`lib/db/`，Phase 6.5）；既有 `createDocument`（`lib/services/document.ts`）
- 縮圖渲染（`components/upload-queue-list.tsx`、`dropzone.tsx`）；shadcn `Alert` / `Dialog`
- Auth + firm/client 授權與 RLS（Phase 6b；`lib/services/invoice.ts` 的 `assertCallerCanAccessClient`）
- Test fixture helpers（`tests/utils/supabase.ts`）

## 10. 驗證

1. `npm run lint`、`npm run test:run`（eval 在 manifest 空時 skip）。
2. `npm run dev` 手動：
   - **一致（高信心）**：上傳清晰進項發票 + 選進項 → 立刻見於期別頁；`classifier_hint` 無 `review_status`。
   - **不一致（事務所修正）**：上傳銷項發票但選進項 → 立刻見於期別頁；數秒後該期別「分類待確認」+1
     → 事務所點「改為銷項」→ 子表 `in_or_out` 更新、計數 -1、`resolution='switched_in_out'`。
   - **doc type 不符**：折讓單走發票流程 → 檢查點 convert → 刪 invoice 子表 / 建 allowance 子表 / `ocr_status='pending'`。
   - **verdict='other'**：收據相片走發票 → 檢查點 demote → 子表刪除、`doc_type='other'`、`/documents` 多一筆。
   - **direct-other（genuine）**：選「其他文件」上傳保險帳單 → 無子表、不進期別頁、進 `/documents`、OCR 略過。
   - **direct-other 反向（誤標）**：選「其他文件」上傳一張統一發票 → 事務所 `/documents` 該列出現
     「要轉嗎？」chip → promote（手動選期別）→ 建子表、`doc_type='invoice'`、OCR 觸發。
   - **客戶端視角**：客戶 `/documents` 只見瀏覽 + 刪除、無任何分類提示；客戶看不到佇列 / 徽章 / chip。
   - **periodless 盲區提醒**：事務所進期別頁見「分類待確認：N」+「本客戶有 N 份其他文件（含 M 份疑似發票）」粗提醒。
   - **分類失敗**：弄壞 `GEMINI_API_KEY` → 文件照走、`classifier_hint.error` 寫入、檢查點無增。
   - **延遲穩健**：停掉 classification-worker → 上傳與期別頁完全不受影響。
   - **審核 dialog 旗標**：開一筆 `disagreed=true` 的發票 → 表單頂端見 inline alert。
3. psql 抽查：`SELECT id, doc_type, classifier_hint FROM documents WHERE classifier_hint IS NOT NULL ORDER BY created_at DESC LIMIT 10;`
4. **不退步 smoke**：上傳發票 → OCR → review → confirm → 期別頁 / TET_U 匯出；折讓同跑；電子發票匯入不受影響。

## 11. 依賴與時序 / 分支

啟動條件 = Voucher `VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md` 的 **Phase 5.5 / 5.6 / 6a / 6b / 6.5**（皆已完成）：
- **5.5 / 6b**：`documents` 為 CTI 父表，`createInvoice` / `createAllowance` 內部 documents-first，
  `document_id` 為 `NOT NULL UNIQUE`。
- **5.6**：storage 已收斂到 `documents` bucket。
- **6.5**：Drizzle 交易層，供 §5.4 多表原子動作。
- **6a.1**：`sync_documents_cache_from_subtables` trigger 維持 `documents.amount` / `doc_date` 同步；
  demote / convert 改 doc_type 後仍正確（childless `other` 由父表自身為真實來源）。

Phase 7（期別批次分錄）正交：分錄只對已判定且有子表的發票 / 折讓產生，`other` 不產生分錄。

依 memory：開新 feature branch（不動 main，`feedback_branch_workflow`）；拆可讀的數個 commit
（schema → 純函式 / worker → 服務動作 → UI → eval，`feedback_separate_commits`）；migration .sql
不自動套用（`feedback_no_apply_migration`）。

## 12. 後續路線（暫不實作）

**R1 — 開放客戶自我校正**：把 §5.4 動作與一個客戶端佇列（portal「待您確認」+ 徽章）開放給客戶，
讓客戶在上傳後自己處理不一致，減輕事務所負擔。**門檻**：§7 的準確度 / 信心校準達標、且有真實
不符率數據支撐；分階段（先低風險的 doc-type、後 `in_or_out`）。本計畫的 `classifier_hint` /
動作 / 信心欄位已為此鋪好底，屆時主要是加客戶端 UI 與權限放寬。

**R2 — classifier-first（免上傳分類選擇）**：拿掉上傳時的分類挑選，由分類器路由、人類改為
**事後確認**（recognition 取代 recall）。需更高且校準的信心，尤其 `in_or_out`。即使準確度足夠，
為符合「會計師把關」仍可能刻意保留人類對稅務影響欄位的確認。屬更後期路線。

**R3 — 精準歸期**：讓反向檢查額外回傳日期，以 `doc_date` 為橋，把疑似發票的 `other` 精準帶到
對應期別的檢查點（取代 §6.4 的粗提醒）。
