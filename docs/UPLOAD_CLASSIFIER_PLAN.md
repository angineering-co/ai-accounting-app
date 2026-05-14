# 上傳分類器 (Upload Classifier) — 設計與實作計畫

> **狀態**: 延後實作。啟動條件 = `VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md`
> **Phase 5 + Phase 5.5 + Phase 6** 全部完成。Phase 5.5 把 upload pipeline 倒置為
> documents-first 是本計畫的關鍵前提 (見 §3、§5)。
>
> **配套文件**: [`VOUCHER_JOURNAL_ENTRY_PLAN.md`](./VOUCHER_JOURNAL_ENTRY_PLAN.md) §3.1
> (`documents` schema)、§3.2 (CTI 關係);
> [`VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md`](./VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md) Phase 5.5
> (documents-first upload refactor)。本文件假設 `documents` 已存在、
> `invoices` / `allowances` 已具備 `document_id` 反向指標、且 upload 流程已是
> documents-first (`createDocument` 為主入口、`linkInvoiceToDocument` /
> `linkAllowanceToDocument` 為子表掛接動作)。

## 1. 動機

`in_or_out` (進項/銷項) 上傳時錯選會導致 TET_U 申報資料錯誤, 法律風險不可
忽視。目前唯一抓得到分類錯誤的時機是使用者上傳當下的選擇, 因為
`lib/services/gemini.ts:172–174` 的擷取 prompt 寫死:

> "If Source is 進項 -> Client is the **Buyer**.  […]
>  If Source is 銷項 -> Client is the **Seller**.  […]"

擷取流程把 buyer/seller 映射綁死於使用者選擇的 `in_or_out`, 與文件實際內容
無關。因此事後做「buyer.tax_id 是否等於 client.tax_id」的校驗永遠回傳一致,
無法暴露分類錯誤。

評估過、排除的兩個替代方案:
- **中立化擷取 prompt + 程式碼端角色檢查**: 模糊文件的擷取準確度有退步風險,
  需先建立 eval 框架才敢動。
- **單一驗證呼叫只查 in/out**: 無法捕捉 doc type (invoice vs allowance) 的錯
  分類。

本案決定: 於上傳當下執行同步 4-class 分類器
(`{invoice, allowance} × {進項, 銷項}` 加上「作廢」、「非發票/折讓」旗標),
與使用者選擇比對, 不一致時顯示**軟性警告** (可繼續上傳), 並把分類結果落於
`documents.classifier_hint`, 後續審核 dialog 可顯示。

擷取 prompt 維持原樣 (它是 happy-path 準確度的支柱); 過了這道門, `in_or_out`
即視為可信。

**與 documents-first upload pipeline 的契合**: Phase 5.5 把上傳流程倒置為「先建
documents row、再依分類路由到子表」之後, classifier 從原本的「上傳前警告比對」
升級為**路由分流工具**。`verdict='other'` (非發票/折讓) 不再需要被強迫塞進 invoice
/ allowance 或取消;documents row 可以直接以 `doc_type='other'` 留在 documents 表,
**不建子表**, 不參與 TET_U / IS-BS, 直到使用者於 /documents 列表手動重新分類或刪除。
這讓 classifier 的「四類 + other」設計名實相符。

## 2. v1 範圍 / 範圍外

**本計畫 v1 範圍內**(在 Voucher Phase 5.5 已落地的 documents-first 基礎上新增):
- 上傳當下同步分類器 (4 類 + other + voided)
- `documents.classifier_hint` JSONB 欄位 + 寫入
- 批次審核 dialog (含 `other` 卡片變體)
- 啟用 `doc_type='other'` 路徑 (Voucher §3.1 已將 enum 簡化為 `invoice / allowance / other`;Phase 5 schema 已含 'other',本計畫只是讓 'other' row 真正被自動產生 + 提供管理 UI)
- **最簡 /documents 列表頁** (僅列 `doc_type='other'` 的文件 + 重分類 / 刪除動作) — 因為 'other' 文件在期別頁不出現,沒這頁等於孤兒
- Eval harness scaffold

**v1 範圍外**:
- 修改擷取 prompt 本身。
- 同次上傳內快取分類結果 (參考 PR #138 FIA 快取分析: 節省約 2–10%, 不值得
  維護成本)。
- 任何硬阻擋 (hard block); 所有不一致都僅為軟性警告, 含 doc type 不符。
- 跨上傳記憶使用者覆蓋 (briefing 中提到的「N 次連續確認後不再問」)。等有
  分類不符率資料後再評估。
- 完整 /documents 文件管理頁面 (含 invoice / allowance 與所有子表的跨類查找、
  進階篩選等);v1 的 /documents 列表**僅服務 `doc_type='other'` 的待分類文件**,
  既有 invoice / allowance 仍以期別頁為主入口。完整版留待 v2+ 引入非 VAT 子表
  時擴充。

## 3. 流程設計 (documents-first + Batch)

`components/document-upload-section.tsx` 桌機支援拖放最多 10 份檔案,
手機 portal FAB 也支援多選, 單檔流程是批次流程的 N=1 特例。所以以批次為主
設計, 單檔自動兼容。

**核心改變 (vs Phase 5.5 之前的設計草案)**: 此計畫**依賴 documents-first upload pipeline**
(由 Voucher Phase 5.5 落地)。每份檔案上傳第一時間建 documents row, classifier
判決決定**接下來掛不掛子表**,而不是「分類後才決定要建 invoice 還是 allowance」。
這讓 `verdict='other'` 真正有歸宿 (停在 documents、不建子表)。

```
使用者拖放 1–10 份檔案 + 選擇分類 (doc_type, in_or_out)
        │
        ▼
所有檔案平行 Storage upload + createDocument
   Promise.all(files.map(f => createDocumentAction({
     storagePath, mimeType, clientId,
     doc_type: userChoice.docType,    // 初值 = 使用者選擇
     in_or_out: userChoice.inOrOut,   // 寫入未來會建的子表用
   })))
   → 每份檔案: documents row (status='active', classifier_hint=NULL) 已存在
   → OCR worker 已 enqueue (Phase 5.5 起 OCR 觸發點在 documents insert)
        │
        ▼
[NEW] 所有檔案平行分類:
   Promise.all(docs.map(d => classifyDocumentAction({ documentId })))
   牆鐘時間 ≈ 最慢的一個呼叫 ≈ 1-2s, 並非 N × 1-2s
   → 每份檔案: documents.classifier_hint 寫入 verdict
        │
        ▼
[NEW] 分群結果:
   - agreed[]      → 立刻呼叫 linkInvoiceToDocument / linkAllowanceToDocument
                     (依使用者選擇 = classifier verdict)
                     classifier_hint.disagreed = false
   - disagreed[]   → 統整於一個批次審核畫面 (見下)
                     子表「暫不建立」, 等使用者決策
   - failed[]      → 寫 log, 退回「依使用者選擇 link 子表」
                     classifier_hint = { error: '...', disagreed: false }
        │
        ▼
disagreed[] 為空: agreed 全部建好 invoice / allowance 子表, 無 UI 中斷
        │
disagreed[] 非空: 顯示 <DocumentClassifierBatchReview>
   每份檔案一張卡片, verdict 不同卡片變體不同:
   - verdict ∈ {invoice, allowance}: [改成 X] / [維持原選擇] / [取消此筆]
   - verdict='other': [改為其他憑證 (留在 documents、不建子表)] /
                       [維持原選擇 (仍建 invoice/allowance)] / [取消此筆]
   底部單一「繼續上傳」按鈕 (所有 row 都選好才啟用)
   agreed[] 已於背景建好, 不出現在此畫面
        │
        ▼ 依各 row 決策派發:
[改成 X]                 → 改 documents.doc_type=X + linkXToDocument
[維持原選擇] (vs invoice/allowance verdict)
                         → linkXToDocument(用使用者原選擇) + classifier_hint.disagreed=true
[改為其他憑證] (verdict='other')
                         → UPDATE documents SET doc_type='other'
                            (不建子表, 文件停在 documents)
[維持原選擇] (vs verdict='other')
                         → linkXToDocument(用使用者原選擇) + classifier_hint.disagreed=true
                            (使用者堅持這是 invoice/allowance, 強過 classifier)
[取消此筆]               → soft delete documents (status='deleted')
                            + storage 物件清除
        │
        ▼
原 extraction worker 流程不變 (OCR 在 createDocument 時已 enqueue): 自 pgmq 取出,
跑 Gemini 擷取, 寫 extracted_data, status → processed。worker 只對
doc_type ∈ {invoice, allowance} 的 row 做擷取; doc_type='other' 的 row OCR
worker 直接 skip + 標記 ocr_status='skipped'。
```

> **關鍵不變式**: 每份檔案永遠有 `documents` row (即使取消上傳, soft delete 留在表),
> 子表 row 為 0 或 1 個 (UNIQUE constraint)。本流程的核心保證: documents row 在 storage
> upload 成功的瞬間就建好,後續任何決策都是「在這份已知 row 上掛 / 不掛子表 / 改 doc_type」。

### Batch 延遲預算

| 步驟 | 牆鐘時間 | 備註 |
|---|---|---|
| Storage 上傳 (10 份平行) | 2-5s | 未變 |
| 分類器 (10 份平行 `Promise.all`) | +1-2s | 新增 |
| 渲染批次審核畫面 (若有 disagreed) | +<100ms | 新增 |
| 使用者決策時間 (僅 disagreed 時) | 視情況 | 新增 |

淨增加 ≈ 1-2s, 當所有檔案一致時 (常見情境)。藉由平行化避開了 N × 對話框
排隊的卡頓。

### 故障處理

分類可能失敗 (Gemini outage、回傳格式錯、被 rate limit)。本門的職責是抓
**分類錯誤**, 而非為分類器健康度把關。所以單檔分類失敗 = 靜默回退: 寫 log、
依使用者原本選擇上傳、`classifier_hint` 寫入 `{ error: '<reason>', ... }`
而非 verdict 欄位。

審核 dialog 可在底部以低調文字顯示「上傳時分類失敗」(選配)。

全部 N 個都失敗 (通常代表 outage / 金鑰問題) 同樣放行 — 不能因 Gemini
停擺而全 firm 上傳卡住。

## 4. 資料層

### 4.1 Schema 變更

**單一新欄位**: `documents.classifier_hint JSONB NULL`。**只加在 documents,
不加在子表** — 分類器的判決概念上屬於「這份文件本身」, 自然對應 CTI 父表。

```sql
-- supabase/migrations/<ts>_add_classifier_hint_to_documents.sql
ALTER TABLE documents ADD COLUMN classifier_hint JSONB;
COMMENT ON COLUMN documents.classifier_hint IS '上傳時分類器判決; 欄位設計詳見 docs/UPLOAD_CLASSIFIER_PLAN.md §4.2';
```

> **無需 enum 擴充**: Voucher 計畫 §3.1 已將 `doc_type` 簡化為三值 `invoice / allowance / other`,
> Phase 5 schema 落地時 'other' 即已存在。本計畫只需新增 `classifier_hint` 欄位,
> 不需要動 doc_type CHECK 約束 / enum type。

依 memory `feedback_no_apply_migration`: 寫好 .sql 後不自動 `supabase migration up`、
也不自動 regenerate types, 交由使用者執行。

### 4.2 JSONB 形狀

```ts
{
  doc_type: 'invoice' | 'allowance' | 'other',  // 與 documents.doc_type 同語意 (參考用; documents.doc_type 才是 authoritative)
  in_or_out: 'in' | 'out' | null,                // VAT 子表才有意義; doc_type='other' 時為 null
  voided: boolean,                                // 對應 documents.status='void' 概念
  confidence: 'low' | 'medium' | 'high',
  disagreed: boolean,                             // UX 旗標 (使用者選擇 ≠ 判決)
  model: string,                                  // 例 'gemini-2.5-flash-lite'
  classified_at: string,                          // ISO timestamp
  error?: string,                                 // 失敗時填入; verdict 欄位則為 null
}
```

> `doc_type` 與 `documents.doc_type` 表面重複, 但意義不同:
> - `documents.doc_type`: 使用者最終決定 (可能採納分類器建議或維持原選擇),
>   是 authoritative
> - `classifier_hint.doc_type`: 分類器當下的看法, 是個 audit / 回顧用紀錄
>
> 若兩者不一致 ⇒ 使用者覆蓋了分類器建議 (即 `disagreed=true`)。

### 4.3 Zod schema

`lib/domain/models.ts`: 新增 `classifierHintSchema`, 加進 documents row schema
(`classifier_hint: classifierHintSchema.nullable().optional()`)。

## 5. 服務層

### 5.1 純函式: `classifyDocument`

新檔: `lib/services/document-classifier.ts`

風格沿用 `lib/services/gemini.ts`:
- 原生 `fetch()` 打 `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
- `process.env.GEMINI_API_KEY` (Node) / `Deno.env.get` (Edge)
- `inline_data` + `Buffer.from(fileData).toString('base64')`, MIME allowlist 與
  `lib/services/gemini.ts:42-48` 一致 (PDF、PNG、JPEG、GIF、WebP)
- `generationConfig.response_mime_type: "application/json"`
- `JSON.parse` 後**加一道 Zod runtime parse** (現有擷取流程沒做; 對小模型加個
  防呆便宜划算)

```ts
export const CLASSIFIER_MODEL = 'gemini-2.5-flash-lite';

export interface ClassifyDocumentArgs {
  fileData: ArrayBuffer;
  mimeType: string;
  clientInfo: { name: string; taxId: string };  // 讓模型可比對 buyer/seller 與 client tax_id
}

export interface DocumentClassification {
  docType: 'invoice' | 'allowance' | 'other';
  inOrOut: 'in' | 'out' | null;
  voided: boolean;                                // 與 §4.2 JSONB 欄位同名, 落庫零映射
  confidence: 'low' | 'medium' | 'high';
}

export async function classifyDocument(args: ClassifyDocumentArgs): Promise<DocumentClassification>;
```

> `model` 與 `classified_at` 不在本函式回傳值內 — 它們是落庫邊界 (Server
> Action 包成 `classifier_hint` 物件時) 才填入的 metadata, 不該與模型實際
> 產出混淆。

### 5.2a 檔案大小: 20MB inline_data 上限的處理

應用層 (`components/document-upload-section.tsx:90`、`portal-upload-fab.tsx:63`、
`invoice/invoice-upload-dialog.tsx:114`) 允許單檔最大 **50MB**, 但 Gemini
`generateContent` 的 `inline_data` 上限是 **20MB**, 且 base64 編碼會放大
約 33%, 所以原始檔超過 ~15MB 即會被拒絕。

擷取流程 (extraction-worker) 也吃同樣的上限, 但分類器更挑剔 —— 真實 50MB
PDF 雖罕見, 仍需保護。處理策略:

1. **影像 (PNG/JPEG/WebP/GIF)**: 若 `fileData.byteLength > 15 * 1024 * 1024`,
   先用 server-side image processing 縮放至長邊 ≤ 2048px、品質 0.85 JPEG。
   `sharp` 已是 Next.js 預設可用相依。分類器只看版面/印章/稅號, 解析度
   2048px 足夠。
2. **PDF**: 若同樣超過 ~15MB, 用 `pdf-lib` 或 `pdfjs-dist` 只擷取第 1 頁
   後另存; 統一發票/折讓單實務上幾乎都是單頁文件, 第 1 頁就有所需訊號
   (賣方/買方稅號、作廢章、文件抬頭)。
3. **超過 ~15MB 且既非影像亦非可處理 PDF**: 直接回傳 `classifier_hint =
   { error: 'file_too_large', ... }`, 走 §3 故障處理的「靜默通過」路徑。
   使用者選擇被信任, 不阻擋上傳。

此降採樣只用於**分類器路徑**; 擷取 worker 仍讀原檔 (`extractInvoiceCore`
不變)。分類器與擷取兩段對檔案有不同 fidelity 需求, 不需共用同一份預處
理結果。

成本/延遲補充: 縮放/拆頁本身 < 200ms (server-side), 反而能讓 Gemini 呼叫
更快, 因為 payload 更小。

### 5.2 Prompt 設計原則

與擷取 prompt **明確區隔**: 中立, **不**接受任何預先宣告的 `in_or_out`。
分類器只看文件 + `clientInfo`, 回報所看見的:

- 文件類型: `invoice` (統一發票) / `allowance` (折讓證明單) / `other`
- 若為 invoice/allowance: 找出 seller_tax_id 與 buyer_tax_id, 與 `clientInfo.taxId` 比對:
  - seller_tax_id == client.tax_id → `in_or_out='out'` (銷項)
  - buyer_tax_id == client.tax_id → `in_or_out='in'` (進項)
  - 都不符 → `in_or_out=null`、`confidence` 不得高於 `low`
- `isVoided`: 偵測作廢章 / 紅色浮水印 / 顯式「作廢」文字
- `confidence`: 模型依檔案清晰度 / 完整度自評

輸出 JSON shape 與 `DocumentClassification` 一致; prompt 必須明確要求 JSON
only、無前綴。

### 5.3 Server action 包裝 (documents-first 兩步驟)

同檔 (`'use server'` 區段):

```ts
// 已由 Voucher Phase 5.5 提供, 本計畫只是呼叫
// export async function createDocumentAction(args): Promise<{ documentId: string }>

export async function classifyDocumentAction(args: {
  documentId: string;
}): Promise<DocumentClassification>
```

`classifyDocumentAction` 步驟:
1. Auth check (`createClient()` → `auth.getUser()`)
2. 授權檢查: 沿用 `lib/services/invoice.ts:createInvoice` lines 76-104 的 pattern;
   以 documentId 反查 firm/client 後校驗
3. 自 documents row 讀 `file_url`、`mimeType`、`client_id`
4. 自 `invoices` storage bucket 讀檔 (同 `lib/services/allowance.ts:165-167`)
5. 取 client name + tax_id (`lib/services/client.ts`)
6. `classifyDocument()` 取得 verdict
7. **同一動作內** UPDATE documents SET classifier_hint = { ...verdict, model,
   classified_at, disagreed: <比對使用者初值算出> }
8. 回傳 verdict 供客戶端決策

> 與原計畫的差異: 不再是「分類結果由客戶端帶回, 後續 createDocument 落庫」。
> documents row **已在上傳當下由 `createDocumentAction` 建好** (Phase 5.5 流程);
> classifier action 是針對已存在的 row 做 UPDATE。這讓「documents 不會卡在
> 中間態 (檔案上傳了但 row 還沒建)」的不變式更乾淨。

### 5.4 路由 (分類後依決策派發)

`lib/services/document.ts` 提供:
- `linkInvoiceToDocument(documentId, vatArgs)` — Phase 5.5 已存在,
  INSERT invoices row 指向已存在的 documents
- `linkAllowanceToDocument(documentId, vatArgs)` — Phase 5.5 已存在
- `updateDocumentDocType(documentId, newDocType, options)` — 新增,
  支援「verdict='other' → 把 doc_type 從使用者原選擇改為 'other'」這條路徑
- `softDeleteDocument(documentId)` — 取消上傳時, status='deleted' +
  cleanup storage 物件 (沿用既有 storage 刪除 helper)

派發邏輯由客戶端 (上傳元件) 在分類完成後依使用者決策呼叫上述任一函式。
**不在 server 端重跑分類器** — 信任 documents.classifier_hint 已是
server-authoritative。

## 6. UI 層

### 6.1 批次審核元件

新檔: `components/document-classifier-batch-review.tsx`

單一 modal, 處理 1-N 個分類不一致檔案。用 shadcn `Dialog` (非
`AlertDialog` — 後者僅支援 confirm/cancel; 批次需可捲動)。

```ts
interface DisagreeingFile {
  id: string;                                   // 本地 id (= documentId, 已建好)
  documentId: string;
  filename: string;
  thumbnailUrl: string | null;                  // signed URL, 來自已建好的 document
  userChoice: { docType: 'invoice' | 'allowance'; inOrOut: 'in' | 'out' };
  verdict: DocumentClassification;
}

type Decision =
  | 'switch_to_invoice_in'  | 'switch_to_invoice_out'
  | 'switch_to_allowance_in' | 'switch_to_allowance_out'
  | 'switch_to_other'        // 新增: 留在 documents 不建子表 (verdict='other' 時)
  | 'keep'                   // 仍按 userChoice 建子表 (classifier_hint.disagreed=true)
  | 'cancel';                // soft delete document + storage cleanup

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: DisagreeingFile[];
  tone: 'firm' | 'client';
  onSubmit: (decisions: Record<string /*file.id*/, Decision>) => void;
}
```

排版: 縱向卡片清單, 每張卡片:
- 左: 縮圖 (沿用 `components/upload-queue-list.tsx:76-93` pattern)
- 中: 檔名 + 平語化說明
- 右: 依 verdict 變體呈現選項 (見下)
- 預設不選任何項; 底部「繼續上傳」按鈕在所有 row 都選好前 disabled

**卡片變體**:

A. `verdict.docType ∈ {invoice, allowance}` 且與 userChoice 不一致:
   選項: [改成 verdict 的 docType+inOrOut] / [維持原選擇] / [取消此筆]

B. `verdict.docType === 'other'` (新): 該文件看起來不是發票或折讓單。
   選項: [改為其他憑證 (留在文件庫,不建發票/折讓)] /
         [維持原選擇 (仍建 invoice/allowance)] /
         [取消此筆]
   卡片內文 (client tone): 「這份文件看起來不是統一發票或折讓單。
                            您可以把它收進文件庫不歸入發票/折讓,
                            或仍按原本選擇上傳。」
   卡片內文 (firm tone): 「分類為 other (非 invoice/allowance);
                          可改為 doc_type=other 留在 documents、不建子表」

單檔即 N=1 排版, 不另寫單檔 dialog。

文案 (依 tone 切換):
- **client tone** (非專業): 平語化。
  「這份文件看起來像**銷項折讓單**, 但您上傳到了**進項發票**。」
- **firm tone** (事務所): 簡潔, 可用術語。
  「偵測為銷項折讓, 所選為進項發票」

標題:
- 單檔: 「請確認分類」
- 批次 (N>1): 「N 份文件分類不一致, 請確認」

字級依專案規約: `text-base` 為主, `text-sm` 為輔, 禁用 `text-xs`。

分類失敗的檔案**不**進此 dialog (它們已靜默通過); 可選: 底部低調文字
「另有 K 份文件分類失敗, 已照您的選擇上傳」。

### 6.2 接入 3 個上傳入口

每個入口的改動形狀一致, pseudocode:

```ts
async function processBatch(files: File[], userChoice) {
  // 1. Storage 上傳 + createDocument 平行
  //    (Phase 5.5 起 createDocumentAction 內部處理 storage upload + INSERT documents)
  const docs = await Promise.all(files.map(f => createDocumentAction({
    file: f, clientId,
    doc_type: userChoice.docType,        // 初值
    in_or_out: userChoice.inOrOut,       // 暫存以備建子表
  })));
  // 結果: docs[].documentId, files 已成 documents row, classifier_hint=NULL

  // 2. 分類器平行 (對已存在的 documentId 跑)
  const classifications = await Promise.all(
    docs.map(async (d) => {
      try {
        const verdict = await classifyDocumentAction({ documentId: d.documentId });
        // server action 已將 verdict 寫進 documents.classifier_hint
        return { ...d, verdict, error: null };
      } catch (err) {
        console.error('classifier failed for', d.filename, err);
        return { ...d, verdict: null, error: String(err) };
      }
    })
  );

  // 3. 分群 (only invoice/allowance verdicts compare to userChoice; 'other' always disagrees)
  const disagreed = classifications.filter(c => c.verdict && (
    c.verdict.docType === 'other' ||
    c.verdict.docType !== userChoice.docType ||
    c.verdict.inOrOut !== userChoice.inOrOut
  ));
  const agreed = classifications.filter(c => c.verdict && !disagreed.includes(c));
  const failed = classifications.filter(c => !c.verdict);

  // 4. agreed + failed: 立刻 link 子表 (依使用者初值, 此時 verdict 與 userChoice 一致或不可用)
  await Promise.all([
    ...agreed.map(c => linkSubtableForChoice(c.documentId, userChoice)),
    ...failed.map(c => linkSubtableForChoice(c.documentId, userChoice)),
    // classifier_hint.disagreed=false 已由 server action 寫入 (或 error)
  ]);

  // 5. disagreed 進批次審核 dialog
  if (disagreed.length === 0) return;
  const decisions = await openBatchReview({ files: disagreed, tone });
  await Promise.all(disagreed.map(c => {
    const dec = decisions[c.documentId];
    switch (dec) {
      case 'cancel':
        return softDeleteDocument(c.documentId);  // status='deleted' + storage cleanup
      case 'switch_to_other':
        return updateDocumentDocType(c.documentId, 'other');
        // 文件停在 documents, 不建子表; OCR worker 將 skip
      case 'switch_to_invoice_in':
      case 'switch_to_invoice_out':
      case 'switch_to_allowance_in':
      case 'switch_to_allowance_out':
        return linkSubtableForChoice(c.documentId, parseDecision(dec));
      case 'keep':
        return Promise.all([
          linkSubtableForChoice(c.documentId, userChoice),
          markClassifierDisagreed(c.documentId),  // 把 classifier_hint.disagreed = true
        ]);
    }
  }));
}
```

`linkSubtableForChoice(documentId, choice)` 為本地 helper, 依 `choice.docType`
派分到 `linkInvoiceToDocument` 或 `linkAllowanceToDocument` (Phase 5.5 已存在,
INSERT 子表 row 指向已存在的 documents)。`markClassifierDisagreed(documentId)` 為
單表 UPDATE: SET classifier_hint = jsonb_set(classifier_hint, '{disagreed}', 'true')。

**修改檔案**:
- `components/document-upload-section.tsx` (lines ~138-157): 接 `processBatch`,
  `tone` 由 parent 依角色帶入 (firm 期別頁 vs portal)
- `components/invoice/invoice-upload-dialog.tsx` (lines ~141-150): 同上,
  firm-only `tone="firm"` 寫死
- `components/portal-upload-fab.tsx` 的 parent (在 `app/firm/[firmId]/client/[clientId]/portal/...`):
  `tone="client"`; FAB 本身不改, 是它回呼進來的 parent 接 `processBatch`

### 6.3 審核 dialog 顯示分類不符旗標

修改 `components/invoice-review-dialog.tsx` 與 `components/allowance-review-dialog.tsx`:

當對應 documents row 的 `classifier_hint?.disagreed === true`, 於表單頂端
渲染一條 inline `Alert` (shadcn variant `default`, 提示但不警示):

> 「上傳時系統判斷此文件為 X, 但您選擇 Y, 請於確認前再次核對分類。」

僅資訊性, 不阻擋確認。字級 `text-sm`。

### 6.4 最簡 /documents 列表頁

新檔: `app/firm/[firmId]/client/[clientId]/documents/page.tsx`

僅列出 `doc_type='other'` 的文件 (因為其他 doc_type 已有期別頁 / 傳票頁可入)。
沒有此頁面, 'other' 文件等於孤兒, 對使用者不可見。

**列表欄位**: 縮圖、檔名、`doc_date`、`classifier_hint` 摘要 (verdict + confidence)、操作。

**操作按鈕** (每列):
- 「重分類為發票」→ 開 dialog 讓使用者指定 in/out → UPDATE `documents.doc_type='invoice'` +
  `linkInvoiceToDocument(...)` (此時 OCR worker 會重新被觸發, 因為 doc_type 變成 invoice)
- 「重分類為折讓」→ 同上但 link allowance
- 「刪除」→ soft delete (`status='deleted'`) + 清 storage object

**Sidebar 入口**: `components/firm-sidebar.tsx` 與 `components/portal-sidebar.tsx`
新增「其他文件」入口, 徽章顯示該 client 之 `doc_type='other'` 文件數量。

**排序**: `created_at DESC`。**分頁**: 沿用 `usePaginatedPeriodInvoices` SWR pattern。

**字級**: `text-base` 為主, 列表 metadata 用 `text-sm`。

> **為何不做完整 /documents 頁**: v1 唯二的「可入」doc_type 是 invoice/allowance,
> 期別頁已分別呈現。完整跨子表查找、進階篩選留待 v2+ 引入非 VAT 子表時再做。
> 本頁面的存在價值是讓 `'other'` 文件不孤兒, 不是文件管理中心。

## 7. Eval Harness

依 prior session 評估目標: 收 ~50 真實上傳 + ground truth, 量測分類器準確
率, 作為「軟警告」是否可進階為「硬阻擋」之決策依據。

**新檔**:
- `tests/fixtures/classifier/README.md`: 收樣指引 (匿名化、敏感欄位處理)
- `tests/fixtures/classifier/manifest.json`: 起始為 `[]`, 之後填入
  `{ filename, ground_truth: { docType, inOrOut, isVoided }, notes }[]`
- `tests/fixtures/classifier/.gitignore`: 排除影像檔
- `tests/integration/document-classifier.eval.ts`: 讀 manifest, 逐檔呼叫
  `classifyDocument()`, 算 per-class precision/recall + 整體準確率, 印表格。
  **manifest 為空時 skip** (CI 不會因此 fail)
- `lib/services/document-classifier.test.ts`: parsing 層單元測試 (mock fetch、
  Zod 驗證、錯誤路徑), 不打真 Gemini

**非**回歸測試, 是量測工具。用其輸出決定 doc-type 分類是否可升級為硬阻擋。

## 8. 改動清單一覽

| 檔案 | 改動 |
|---|---|
| `supabase/migrations/<ts>_add_classifier_hint_to_documents.sql` | NEW — documents 加 JSONB 欄位 |
| `supabase/database.types.ts` | regenerate (使用者執行) |
| `lib/domain/models.ts` | 加 `classifierHintSchema` + 擴充 documents schema |
| `lib/services/document-classifier.ts` | NEW — `classifyDocument` + `classifyDocumentAction` |
| `lib/services/document-classifier.test.ts` | NEW — 單元測試 |
| `lib/services/document.ts` | `createDocument` 接受並寫入 `classifier_hint` |
| `components/document-classifier-batch-review.tsx` | NEW — 單一 modal, 1-N 卡片 |
| `components/document-upload-section.tsx` | 接 `processBatch` |
| `components/invoice/invoice-upload-dialog.tsx` | 接 `processBatch` |
| Portal upload parent in `app/firm/[firmId]/client/[clientId]/portal/...` | 接 `processBatch` |
| `components/invoice-review-dialog.tsx` | 顯示 disagreed 旗標 |
| `components/allowance-review-dialog.tsx` | 顯示 disagreed 旗標 |
| `app/firm/[firmId]/client/[clientId]/documents/page.tsx` | NEW — 最簡 /documents 列表 (僅列 `doc_type='other'` + 重分類/刪除) |
| `components/firm-sidebar.tsx` | 加「其他文件」入口 (徽章顯示 'other' 文件數) |
| `components/portal-sidebar.tsx` | 加「其他文件」入口 (client tone) |
| `lib/services/document.ts` | 加 `updateDocumentDocType` (重分類用) |
| `tests/fixtures/classifier/README.md` + `manifest.json` + `.gitignore` | NEW — eval scaffolding |
| `tests/integration/document-classifier.eval.ts` | NEW — eval harness (manifest 空時 skip) |

## 9. Reuse 既有

- shadcn `Dialog` (`components/ui/dialog.tsx`) + `Alert` (`components/ui/alert.tsx`)
- 縮圖渲染 pattern (`components/upload-queue-list.tsx:76-93`、`dropzone.tsx:110-120`)
- Gemini fetch、MIME allowlist、base64 boilerplate (`lib/services/gemini.ts:42-48, 99-129, 245-249`)
- Auth + 授權 pattern (`lib/services/invoice.ts:76-104`)
- Storage 下載 (`lib/services/allowance.ts:165-167` 模式;**Phase 5.5 起 bucket 已從 `invoices` 改名為 `documents`**)
- Storage path convention `{firmId}/{periodYYYMM}/{clientId}/{uuid}.{ext}` 未變
- Test fixture helpers (`tests/utils/supabase.ts:104` `createTestFixture` / `cleanupTestFixture`)

## 10. 驗證

於 worktree (`.claude/worktrees/upload-classifier`) 執行:

1. `npm run lint` — 型別 + ESLint 通過
2. `npm run test:run` — 單元測試通過; eval harness 在 manifest 空時 skip
3. `npm run dev` — 手動瀏覽器驗證:
   - **單檔, 一致**: 上傳清晰 進項 invoice + `in_or_out=in` → 無 dialog,
     documents row + invoice row 建好, `classifier_hint.disagreed=false`
   - **單檔, 不一致**: 上傳 銷項 invoice + `in_or_out=in` → dialog 一張卡 →
     點「維持原選擇」 → row 建好, `classifier_hint.disagreed=true`
   - **單檔, 切換**: 同上, 點「改成 X」 → row 走 verdict 的路徑, `disagreed=false`
   - **單檔, doc type 不符**: 上傳折讓單到 invoice 流程 → 同 UX, switch 鍵改打 `linkAllowanceToDocument`
   - **單檔, "other"**: 上傳非發票 (例: 收據相片) → 卡片顯示三選一 [改為其他憑證 / 維持原選擇 / 取消]
     - 點「改為其他憑證」→ documents.doc_type='other'、無子表 row、OCR 跳過、/documents 頁多一筆
     - 點「維持原選擇」→ 仍建 invoice/allowance 子表、classifier_hint.disagreed=true
     - 點「取消」→ documents soft delete + storage 清除
   - **單檔, 取消**: 觸發 dialog, 點「取消此筆」 → documents row status='deleted', storage 物件清掉
   - **批次, 全一致**: 拖放 5 份吻合的 invoice → 無 dialog, 5 row 靜默出現
   - **批次, 部分不一致**: 拖放 5 份, 其中 2 份 doc type 不符、1 份 in/out 不符、1 份 verdict='other'
     → dialog 4 張卡 (含 other 變體), agreed 不顯示。每張選不同決策 → submit → 取消那筆走 soft delete,
     其餘照各自決策落地。確認牆鐘 ≈ storage 上傳 + ~1-2s, **不是** N × per-file
   - **批次, 分類失敗**: 暫時把 `GEMINI_API_KEY` 弄壞跑一遍 → 失敗檔走 silent
     fallback, `classifier_hint.error` 寫入; 真不符的還是進 dialog; dialog
     底部 footer 數出失敗數
   - **Client portal 批次**: 同 firm 批次, 但 `tone="client"` 文案
   - **審核 dialog**: 開一筆 `disagreed=true` 的 row → 表單頂端見 inline alert
   - **/documents 列表頁**: 進入 `/firm/[firmId]/client/[clientId]/documents` →
     看到剛才「改為其他憑證」那筆收據 → 點「重分類為發票 (進項)」→ 列表少一筆、
     對應期別頁多一筆 invoice → OCR 重新觸發、`extracted_data` 填好後可 review confirm
   - **/documents 刪除**: 上傳一張錯的文件、走「改為其他憑證」 → /documents 頁點刪除
     → row status='deleted'、storage object 清除、列表少一筆
   - **Sidebar 徽章**: 「其他文件」入口的徽章數字隨 /documents 操作即時更新

4. psql 抽查 JSONB 形狀:
   ```sql
   SELECT id, classifier_hint FROM documents ORDER BY created_at DESC LIMIT 5;
   ```

5. **既有發票流程不退步 smoke**: 上傳 invoice → AI extract → review → confirm
   → 期別頁渲染、TET_U 匯出。上傳 allowance 同樣跑一次。

## 11. 分支 / commit

依 memory `feedback_branch_workflow`: 開新 feature branch (例
`feature/upload-classifier`), 不直接動 main。

依 memory `feedback_no_apply_migration`: migration .sql 寫好後**不要**自動
跑 `supabase migration up` 或 regenerate types, 等使用者執行。

## 12. 依賴與時序

本案啟動條件 = `VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md` **Phase 5 + Phase 5.5 + Phase 6** 全部完成。
- **Phase 5**: `documents` 表落地, `classifier_hint` 才有地方加;`doc_type` 三值 enum 含 `'other'`
- **Phase 5.5** (關鍵前提): upload pipeline 倒置為 documents-first;
  `createDocumentAction` 為主入口、`linkInvoiceToDocument` / `linkAllowanceToDocument` 為子表掛接動作;
  OCR 觸發點繫到 document insert。沒有這個前提, classifier 沒有「先建好的 documents row」可作為 UPDATE 目標,
  `verdict='other'` 也無處停留 — 整個流程設計都會崩
- **Phase 6**: CTI backfill, 既有資料都已有對應 documents row

實作前確認 Voucher Phase 5 / 5.5 / 6 PR 已合, 並 `git pull` 取最新 schema。
