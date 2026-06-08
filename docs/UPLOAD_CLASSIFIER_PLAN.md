# 上傳分類器 (Upload Classifier)：設計與實作計畫

> **狀態**：設計定案，待實作。本版為 2026-06 重寫，依據 Voucher 計畫
> **Phase 5.5 / 6b / 7 實際落地後的架構**校正，並改採「非阻擋的客戶端自我校正
> overlay」模型，取代前一版的「上傳當下同步阻擋 + 批次審核 dialog」設計。
>
> **配套文件**：[`VOUCHER_JOURNAL_ENTRY_PLAN.md`](./VOUCHER_JOURNAL_ENTRY_PLAN.md)
> §3.1 (`documents` schema)、§3.2 (CTI 關係)；
> [`VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md`](./VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md)
> Phase 5.5 / 6a / 6b / 7。
>
> **與實際架構的關鍵校正**（前一版計畫假設了未曾實作的 API）：
> - Phase 5.5 並非把上傳改成「`createDocumentAction` 為主入口 + `linkInvoiceToDocument` /
>   `linkAllowanceToDocument` 掛接子表」的兩步式公開 API。實際落地的是
>   **`createInvoice` / `createAllowance` 維持單一公開入口**，內部以一個 Drizzle
>   `db.transaction()` 同時建 `documents` 父 row 與子表 row（documents-first 是
>   **內部**重構，對外簽章不變）。`lib/services/document.ts` 只 export `createDocument`
>   一個內部 helper，**沒有** `linkInvoiceToDocument` / `linkAllowanceToDocument` /
>   `updateDocumentDocType` / `softDeleteDocument`。
> - Phase 6b 已把 `invoices.document_id` / `allowances.document_id` 收緊為
>   **`NOT NULL UNIQUE`**（`20260601000000_tighten_document_id.sql`）。這是
>   **子表指向父表**的保證（每筆子表 row 恰有一個 document），**並未**強制
>   每個 document 一定要有子表。故 `doc_type='other'` 的**無子表 (childless) document
>   在現行 schema 下已合法，本計畫不需要任何 schema 變更**即可產生 childless other。
> - Phase 7 已把分錄產生改為**期別層級批次**（`generateDraftEntriesByPeriod`），
>   與 confirm 解耦。它在文件已被判定為 invoice / allowance / other **之後**才作用，
>   與分類器正交，不影響本計畫設計。

## 1. 動機

`in_or_out` (進項/銷項) 上傳時錯選會導致 TET_U 申報資料錯誤，法律風險不可
忽視。根因在 `lib/services/gemini.ts` 的擷取 prompt 寫死：

> 「If Source is 進項 -> Client is the **Buyer**.  […]
>  If Source is 銷項 -> Client is the **Seller**.  […]」

擷取流程把 buyer/seller 映射綁死於使用者上傳時選的 `in_or_out`，與文件實際
內容無關。因此事後做「buyer.tax_id 是否等於 client.tax_id」的校驗永遠回傳
一致，無法暴露分類錯誤。

**本計畫的定位（核心）**：分類器是一個**讓客戶自我校正上傳分類的工具**。
未來事務所要服務數百個客戶，**審核人員無法當每一筆誤分類的安全網**。因此
分類器的目標是：在誤分類進入審核之前，把「這份分類對嗎？」這個選擇權交回
**客戶手上**，避免把負擔推給審核人員。據此衍生兩條設計鐵則：

1. **校正提示永遠面向客戶，不轉嫁給審核人員。** 任何把不一致丟回事務所
   review 才處理的設計都背離了本計畫目的（那只是把負擔換個位置）。
2. **`other`（非發票/折讓）的早期辨識是分類器的首要價值。** `other` 的路由
   與 invoice / allowance 完全不同（childless document、無子表、不進 VAT 管線），
   越早辨識越能避免它污染期別頁與後續分錄。

擷取 prompt 維持原樣（它是 happy-path 準確度的支柱）；分類器是**獨立於擷取
的另一個 job**，只看文件本身，中立地報告所見。

## 2. v1 範圍 / 範圍外

**v1 範圍內**：
- 上傳後**非阻擋、平行**執行的分類器（獨立 queue / worker，與 extraction-worker 分離）
- `documents.classifier_hint` JSONB 欄位 + 寫入 + 佇列用 partial index
- **客戶端校正佇列**（portal「待您確認」清單 + 側欄徽章）
- 佇列處理動作集：`維持原選擇` / `改進銷 (switch in/out)` / `改為發票↔折讓 (convert)` /
  `改為其他文件 (demote → other)`
- 信心分級（high-confidence 且一致才靜默通過；中/低信心也進佇列）
- **直接上傳「其他文件」** 的上傳選項（客戶確定不是發票/折讓時，直接建 childless
  document，跳過子表與 OCR）
- 審核 dialog 顯示分類不符旗標（資訊性）
- **事務所端 per-period 分類待確認檢查點**（期別頁，報表 / 申報控制項旁）：列該期別
  `review_status='pending'` 文件 + 同組處理動作，作為客戶漏處理佇列時的後路
- `/documents`「其他文件」列表頁（列 `doc_type='other'`：promote 回 invoice/allowance、刪除）；
  因 direct-other 上傳的加入，此頁從「孤兒收容所」升級為真正的文件庫
- Eval harness scaffold

**v1 範圍外**：
- 修改擷取 prompt 本身
- 任何**上傳阻擋 (hard / soft block)**；分類器全程非阻擋，客戶照常先看到上傳結果
- 任何**上傳當下的同步審核 dialog**（前一版設計，已廢除）
- 跨上傳記憶使用者覆蓋（「N 次連續確認後不再問」）；等有不符率資料後再評估
- 同次上傳內快取分類結果（PR #138 FIA 分析：節省 2–10%，不值得維護成本）
- 完整 `/documents` 文件管理頁（跨子表查找、進階篩選）；v1 只做 `other` 列表 + promote/刪除
- 事務所層**跨客戶**彙整待確認佇列（firm-wide）；v1 只做 per-period 檢查點，跨客戶總覽留 v2
- **免上傳分類選擇（classifier-first / no-pick）流程**：拿掉上傳時的分類挑選、改由分類器路由 +
  人類事後確認；需強分類準確度，屬 v2 路線，見 §13
- **電子發票匯入不經分類器**：`processElectronicInvoiceFile` 寫入政府來源的可信 row、
  無人工 in/out 猜測、且不經上傳處理常式 enqueue。分類器只服務人工上傳

## 3. 流程設計（optimistic 建立 + 非阻擋 async 分類 overlay）

`components/document-upload-section.tsx` 桌機支援拖放最多 10 份檔案，手機 portal
FAB 也支援多選，單檔流程是批次流程的 N=1 特例。

**核心模型**：上傳當下**樂觀地 (optimistic)** 依使用者選擇建好 document + 子表
（沿用現行 `createInvoice` / `createAllowance` 不變），使用者**立刻**在期別頁看到
invoice / allowance 並照常作業。分類器是**事後平行跑的另一個 job**，只負責**標註**
與**在不一致時把文件丟進客戶端佇列**，本身**不建、不刪子表**。所有路由 / 拆解動作
都由使用者在佇列裡的決策觸發（對既有 row 做 mutation）。

```
使用者拖放 1–10 份檔案 + 選擇分類 (invoice / allowance / 其他文件)
        │
        ▼
所有檔案平行 Storage upload (documents bucket)
        │
        ├─ 選 invoice / allowance ─▶ createInvoice / createAllowance (現行不變)
        │                            一個交易內建 documents 父 row + 子表 row
        │                            子表 status='uploaded'
        │
        └─ 選「其他文件」──────────▶ createDocument (doc_type='other')
                                     無子表、OCR 略過 (childless document)
        │
        ▼
上傳完成。使用者立刻在期別頁看到 invoice / allowance，照常作業。
        │
        ▼
[非阻擋] 上傳處理常式呼叫 enqueueClassification([...documentIds])
   (在 row 建立後一次性 batch enqueue；createInvoice/createAllowance 本身不改)
        │
        ▼
classification-worker (獨立 pgmq queue / worker，與 extraction-worker 分離)：
   逐筆 dequeue documentId
   → 下載原檔 (documents bucket)；取 client name + tax_id
   → classifyDocument(file, clientInfo) 取得中立 verdict
   → 比對 verdict vs 子表現況 (doc_type + in_or_out)
   → UPDATE documents.classifier_hint：
        高信心且一致        → 不設 review_status (靜默通過，客戶無感)
        不一致 或 中/低信心  → review_status='pending' (進客戶端佇列)
        分類失敗            → 寫 error 欄位、不進佇列 (靜默通過)
   worker 全程不碰子表，只寫 classifier_hint
        │
        ▼
客戶端校正佇列 (portal「待您確認」+ 側欄徽章)：
   列出 review_status='pending' 的文件，每筆一張卡片，客戶有空再逐筆處理。
   動作落地後 review_status='resolved'，離開佇列。
```

> **關鍵不變式**：文件的核心生命週期（子表、OCR、期別頁可見性、confirm、報表、分錄）
> **完全不依賴分類器是否跑完**。分類器掛了 / 排隊延遲 / Gemini outage 時，文件就跟
> 「沒有分類器」時一模一樣地照客戶選擇走完流程。分類器只會「額外」在不一致時加一個
> 佇列旗標。這是選 optimistic 而非 hold-until-verdict 的決定性理由（見 §3.2）。

### 3.1 為什麼非阻擋 / 為什麼分類器是獨立 job

- **延遲穩健**：Gemini 延遲樂觀時 2–3s，但實測可能 8–10s（小模型在負載 / rate limit /
  retry 下）。若把分類做成上傳阻擋，每次批次上傳都要對著 spinner 等最慢的一個呼叫，
  而這只是一個**軟性建議**，不值得。非阻擋讓延遲對使用者完全隱形。
- **與擷取分離**：分類（中立 prompt）與擷取（被 `in_or_out` 帶偏的 prompt）是兩個不同
  關注點，獨立的 queue / worker 讓兩者**故障域隔離**，分類器 outage 不會卡住 OCR，
  反之亦然。**不**與 extraction-worker 共用（不 piggyback）。
- **enqueue 時點**：分類器在**上傳當下**（document 建立後）即 enqueue，目的就是讓客戶
  儘早拿到佇列旗標、趁手邊還有 context 時自我校正。這與 OCR 的 enqueue 時點不同：
  OCR 走的是期別頁的手動 / 批次 enqueue（`lib/services/bulk-extraction.ts`），通常較晚。

### 3.2 路由時機：為什麼 optimistic 而非 hold-until-verdict

| | optimistic（採用） | hold-until-verdict（不採用） |
|---|---|---|
| 子表建立 | 上傳當下依選擇即建 | 等分類 verdict 才建 |
| 期別頁可見 | 立即 | 分類完成前不可見 |
| 分類器 outage / 延遲 | 文件照常走完流程（=無分類器行為） | 文件卡在 childless 中間態，需 reaper 補救，否則孤兒 |
| classifier false-agree（誤判一致）| 子表已建、無提示，審核人員事後 demote | 子表照建、無提示，審核人員事後 demote（**相同**）|

`false-agree`（Gemini 自信地誤判為「與客戶選擇一致」）在兩種策略下**結果相同**：
都會建好子表、不提示、由審核人員事後處理，因為 agree 不產生任何不一致訊號可供路由
反應。但在我們已選的 **pure async** 前提下，分類完成本來就不可靠（背景排隊、可能
outage），此時 hold-until-verdict 會讓分類器變成「文件能不能用」的單點故障，
optimistic 則讓分類器退化成純 overlay。故 optimistic 在 false-agree 軸上與
hold 打平、在 lag/outage 軸上明顯更穩健，勝出。

### 3.3 false-agree 的真正緩解（與路由時機正交）

路由時機擋不住 false-agree，真正的緩解在別處：
1. **信心分級**：不是每個 agree 都靜默。只有 **high-confidence 且一致**才靜默通過；
   **中 / 低信心的 agree 仍進客戶佇列**（「我們不太確定這份文件的分類，請您確認」）。
   這把常見的「不確定型 false-agree」轉成客戶可處理的項目。
2. **永遠可用的 demote / convert 動作**（與分類器無關的人工後路）：審核人員與客戶
   都能對任何文件做 `改為其他文件` / `改為發票↔折讓`。這是 high-confidence 仍誤判
   時的最終後路。

誠實地說：false-agree 無法被設計完全消除，它是客戶自我校正層之後的**殘餘審核負擔**；
信心分級縮小它，demote / convert 讓它在漏網時的修正成本很低。

### 3.4 故障處理

分類可能失敗 (Gemini outage、回傳格式錯、rate limit、檔案過大)。本門的職責是抓
**分類錯誤**，而非為分類器健康度把關。所以：
- 單檔分類失敗 = 寫 `classifier_hint.error`、**不**進佇列、文件照客戶選擇走（靜默通過）。
- 全部失敗（通常代表 outage / 金鑰問題）同樣全部靜默通過，不能因 Gemini 停擺而讓
  整批上傳的客戶被佇列轟炸或卡住。
- worker 端 retry / dead-letter 沿用 pgmq 既有機制（與 extraction-worker 一致）。

## 4. 資料層

### 4.1 Schema 變更（單一新欄位 + 一個 partial index，無其他變更）

```sql
-- supabase/migrations/<ts>_add_classifier_hint_to_documents.sql
ALTER TABLE documents ADD COLUMN classifier_hint JSONB;
COMMENT ON COLUMN documents.classifier_hint IS
  '上傳時分類器判決與佇列狀態; 形狀詳見 docs/UPLOAD_CLASSIFIER_PLAN.md §4.2';

-- 客戶端佇列 / 側欄徽章用 partial index (只索引待處理的 active 文件，極小)
CREATE INDEX idx_documents_pending_classification
  ON documents (client_id)
  WHERE classifier_hint->>'review_status' = 'pending' AND status = 'active';
```

> **無需任何其他 schema 變更**：
> - `doc_type` 已是三值 `invoice / allowance / other`（`20260519000000_create_documents.sql:13`）。
> - childless `other` document 已合法（§ 開頭校正：`document_id NOT NULL UNIQUE` 是
>   子表→父表方向，不強制父表有子）。
> - Phase 6b 的 orphan-detection query 已 scope 在 `doc_type IN ('invoice','allowance')`，
>   故 `other` 天然被排除；唯一要注意的是它需容忍 invoice/allowance 在 convert/demote
>   期間**極短暫**的 childless 中間態（交易內完成，幾乎不可觀察）。

依 memory `feedback_no_apply_migration`：寫好 .sql 後不自動 `supabase migration up`、
也不自動 regenerate types，交由使用者執行。

### 4.2 JSONB 形狀

```ts
{
  // ── verdict (classifier 產出) ──
  doc_type: 'invoice' | 'allowance' | 'other',
  in_or_out: 'in' | 'out' | null,        // doc_type='other' 時為 null
  voided: boolean,                        // 偵測到作廢章 / 紅色浮水印 / 「作廢」字樣
  confidence: 'low' | 'medium' | 'high',

  // ── 比對結果 (worker 落庫時算出) ──
  disagreed: boolean,                     // verdict 的 (doc_type, in_or_out) ≠ 子表現況
  low_confidence: boolean,                // confidence ∈ {low, medium} 的便利旗標

  // ── 佇列狀態 ──
  review_status?: 'pending' | 'resolved', // 需客戶處理時才設; 高信心一致則不設 (靜默)
  resolution?: 'kept' | 'switched_in_out' | 'converted' | 'demoted' | 'promoted',
  resolved_at?: string,                   // ISO timestamp

  // ── metadata ──
  model: string,                          // 例 'gemini-2.5-flash-lite'
  classified_at: string,                  // ISO timestamp
  error?: string,                         // 失敗時填入; 此時 verdict 欄位無意義
}
```

> 急迫佇列 (§6.2) 進件條件：`review_status='pending'` ⟺ worker 判定 invoice/allowance 上傳的
> `disagreed || low_confidence`。**例外（安靜建議）**：direct-other 上傳的反向檢查若覺得像 VAT，
> **不**設 `pending`，只寫 `disagreed=true`，安靜地在 `/documents` 列表呈現 promote 建議
> （§5.6 / §6.5），尊重客戶「這是其他文件」的明確宣告，不進急迫佇列、不計入徽章。
> `classifier_hint.doc_type` 是 audit / 回顧用（分類器當下看法）；`documents.doc_type`
> 才是 authoritative（客戶最終決定）。兩者不一致代表客戶覆蓋了分類器建議。

### 4.3 Zod schema

`lib/domain/document.ts`：新增 `classifierHintSchema`，加進 document row schema
（`classifier_hint: classifierHintSchema.nullable().optional()`）。

## 5. 服務層

### 5.1 純函式：`classifyDocument`

新檔：`lib/services/document-classifier.ts`（純函式段，不標 `'use server'`）。
風格沿用 `lib/services/gemini.ts`：

- 原生 `fetch()` 打 `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
- `inline_data` + base64，MIME allowlist 與 `lib/services/gemini.ts` 一致（PDF、PNG、JPEG、GIF、WebP）
- `generationConfig.response_mime_type: "application/json"`
- `JSON.parse` 後**加一道 Zod runtime parse**（對小模型的便宜防呆）

```ts
export const CLASSIFIER_MODEL = 'gemini-2.5-flash-lite';

export interface ClassifyDocumentArgs {
  fileData: ArrayBuffer;
  mimeType: string;
  clientInfo: { name: string; taxId: string };  // 供模型比對 buyer/seller 與 client tax_id
}

export interface DocumentClassification {
  docType: 'invoice' | 'allowance' | 'other';
  inOrOut: 'in' | 'out' | null;
  voided: boolean;
  confidence: 'low' | 'medium' | 'high';
}

export async function classifyDocument(args: ClassifyDocumentArgs): Promise<DocumentClassification>;
```

`model` / `classified_at` / `disagreed` / `review_status` 不在純函式回傳值內，皆為
worker 落庫邊界才填入的 metadata 與比對結果。

### 5.2 Prompt 設計原則

與擷取 prompt **明確區隔**：中立，**不**接受任何預先宣告的 `in_or_out`。分類器只看
文件 + `clientInfo`，回報所見：

- 文件類型：`invoice` (統一發票) / `allowance` (折讓證明單) / `other`
- 若為 invoice/allowance：找出 seller_tax_id 與 buyer_tax_id，與 `clientInfo.taxId` 比對：
  - seller_tax_id == client.tax_id → `inOrOut='out'` (銷項)
  - buyer_tax_id == client.tax_id → `inOrOut='in'` (進項)
  - 都不符 → `inOrOut=null`、`confidence` 不得高於 `low`
- `voided`：偵測作廢章 / 紅色浮水印 / 顯式「作廢」文字
- `confidence`：依檔案清晰度 / 完整度自評

輸出 JSON shape 與 `DocumentClassification` 一致；prompt 必須要求 JSON only、無前綴。

### 5.2a 檔案大小：20MB inline_data 上限

應用層允許單檔最大 50MB，但 Gemini `generateContent` 的 `inline_data` 上限是 20MB，
base64 放大約 33%，故原始檔超過約 15MB 即會被拒。**此處純為正確性下限**（延遲已因
async 不再是考量）：

1. **影像**：> 15MB 時 server-side 縮放至長邊 ≤ 2048px、JPEG 品質 0.85（`sharp` 已可用）。
   分類器只看版面 / 印章 / 稅號，2048px 足夠。
2. **PDF**：> 15MB 時用 `pdf-lib` / `pdfjs-dist` 只取第 1 頁；統一發票 / 折讓單幾乎都單頁。
3. **超過 15MB 且既非影像亦非可處理 PDF**：回 `classifier_hint = { error: 'file_too_large', ... }`，
   走 §3.4 靜默通過。

此降採樣只用於**分類器路徑**；擷取 worker 仍讀原檔。

### 5.3 Enqueue：`enqueueClassification`（上傳處理常式呼叫）

新增 server action（`lib/services/document-classifier.ts` 的 `'use server'` 段）：

```ts
export async function enqueueClassification(documentIds: string[]): Promise<void>;
```

- 沿用 `lib/services/bulk-extraction.ts` 的 pgmq 模式：`supabase.schema('pgmq_public').rpc('send_batch', ...)`，
  但送進**獨立的 `document_classification` queue**（非 extraction queue）。
- **`createInvoice` / `createAllowance` 完全不改。** 上傳處理常式在所有 row 建立後，
  收集回傳的 `document_id`，一次性 batch enqueue（單一 round trip）。
- direct-other 上傳（§5.6）**同樣 enqueue**（反向檢查預設開啟，見 §5.6）。

> 把 enqueue 放在上傳處理常式而非 `createInvoice` 內，是為了維持 §3 的「creation 不變」
> 原則，並讓 enqueue 一次 batch 化。電子發票匯入 (`processElectronicInvoiceFile`)
> 不經此處理常式、也不 enqueue 分類（§2 範圍外）。

### 5.4 Worker：`document-classification` worker

新檔：`supabase/functions/classification-worker/`（Deno edge function，鏡像
`supabase/functions/extraction-worker/` 的結構：pgmq read、download、Gemini fetch、
回寫、retry / dead-letter）。**獨立部署，與 extraction-worker 分離。**

每筆訊息步驟：
1. dequeue `documentId`
2. 讀 document：`file_url`、`doc_type`、`client_id`；若有子表，讀子表 `in_or_out`
3. 自 `documents` bucket 下載原檔（`extraction-worker` 的 `toDocumentsKey` 模式）
4. 取 client name + tax_id
5. `classifyDocument()` 取得 verdict
6. 比對 verdict vs 現況，算 `disagreed` / `low_confidence`
7. `UPDATE documents SET classifier_hint = { ...verdict, disagreed, low_confidence,
   model, classified_at, review_status }`，其中 `review_status='pending'` 僅當
   `disagreed || low_confidence`
8. 失敗：寫 `classifier_hint = { error, model, classified_at }`，不設 `review_status`

> worker **永遠不碰子表**，只寫 `classifier_hint`。所有子表的建立 / 刪除 / 改 doc_type
> 都發生在使用者佇列決策時（§5.5），而非 worker。

### 5.5 佇列處理動作（對既有 row 的 mutation）

新增於 `lib/services/document.ts`（Drizzle 交易，Phase 6.5 後可用；非 PostgREST RPC，
遵循 memory `feedback_avoid_rpc`）。每個動作完成後設
`classifier_hint.review_status='resolved'` + 對應 `resolution`，使文件離開佇列。

| 動作 | 成本 | 機制 |
|---|---|---|
| `keep` | 極低 | 僅標 resolved；`disagreed` 紀錄保留供 audit |
| `switchInOrOut` | 低 | 子表 `in_or_out` 欄位 update |
| `convertDocType` (invoice↔allowance) | 最高 | 交易內：刪原子表 + 建目標子表（不同 schema）+ 翻 `documents.doc_type` |
| `demoteToOther` | 低 | 交易內：刪子表 + 翻 `documents.doc_type='other'` |
| `promoteFromOther`（**事務所端**）| 低 | 交易內：建子表（**手動指定期別**）+ 翻 `doc_type`（`/documents` other 列表用，demote 的反向）|

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
  // 事務所端專用；期別為手動指定 (v1 不 auto-derive)
  target: { docType: 'invoice' | 'allowance'; inOrOut: 'in' | 'out'; taxFilingPeriodId: string },
): Promise<void>;
```

**OCR 重跑的細節（重要）**：擷取 prompt 被 `in_or_out` 帶偏，所以 `switchInOrOut` /
`convertDocType` 若在 **OCR 已跑過之後**才執行，原 `extracted_data` 的 buyer/seller
映射已錯，需 `ocr_status='pending'`（並清 / 標記 `extracted_data`）以便重新擷取。
但因分類器在**上傳當下** enqueue、OCR 走**期別批次**較晚，**常見情況是客戶在 OCR
之前就處理完佇列**，校正自然流入稍後的擷取，毋需重跑。重跑只是 resolve-after-OCR
的邊緣情況。`convertDocType` 因兩子表 schema 不同，一律以「建全新目標子表 +
`ocr_status='pending'` 重新擷取」處理（不嘗試搬移 `extracted_data`）。

**Guard（v1 從簡）**：上述拆解動作要求子表尚未 confirmed 且無對應 journal entry。
佇列項通常是剛上傳的 row（status `uploaded`），此 guard 多數時候不會觸發；若文件已
confirmed / 已有分錄，動作擋下並提示改由事務所處理。

**可用對象**：`keep` / `switchInOrOut` / `convertDocType` / `demoteToOther`（佇列 §6.2 動作，
皆不需新期別）客戶與事務所皆可用——**客戶經 §6.2 扁平佇列、事務所經 §6.7 per-period 檢查點**
（事務所無扁平佇列）；**`promoteFromOther` 為事務所端專用**，因其需手動指定期別（會計師判斷，
不放給客戶）。所有動作走同一 service 函式，RLS 以 firm + client 範圍隔離（Phase 6b 之 RLS）。

### 5.6 直接上傳「其他文件」（唯一真正用到 document-first 建立的路徑）

客戶確定一份文件不是發票 / 折讓（例：保險帳單、合約、收據）時，可在上傳當下選
「其他文件」。此為**唯一**真正使用 standalone document-first 建立的路徑：

- 呼叫既有的 `createDocument`（`lib/services/document.ts` 已 export）→ 建 childless
  `doc_type='other'` row（已合法，無 schema 變更），**無子表、OCR 略過**。
- 落入 `/documents`「其他文件」列表（§6.5）管理。
- **反向檢查（預設開啟）**：對 direct-other 同樣 enqueue 分類器，捕捉「客戶標其他文件、
  但其實是統一發票 / 折讓單」的反向錯誤。這是 invoice→other 偵測的對稱安全網，且是
  「invoice/allowance 被誤標為 other」這個高風險錯誤的**主要客戶端修正入口**（誤標的真發票
  會靜默跳過 OCR、永不進稅務資料），故不設為可選。
- **安靜建議（quiet suggestion）**：反向檢查的不一致**不**進 §6.2 急迫佇列、不計入徽章。
  因為直接選「其他文件」是客戶的**明確宣告**（強過上傳預設的 in/out 猜測），不該與真正的
  誤分類同等急迫。worker 只寫 `classifier_hint.disagreed=true`（不設 `review_status='pending'`），
  由 `/documents` 列表（§6.5）在該 row 安靜呈現建議 chip（**firm 端可點 promote 選期別、client 端為資訊性**）；
  客戶與事務所瀏覽其他文件時自然看到。事務所端 `/documents`（§6.3 雙側欄）即為此類漏接的瀏覽式後路。

此路徑**不影響** invoice / allowance 主流程（後者維持 coupled-optimistic）。它真正改變
的是**產品範圍而非架構**：`/documents` 從「誤分類收容所」升級為真正的文件庫。

### 5.7 事務所端 per-period 待確認查詢（read helper）

`lib/services/document.ts` 新增：

```ts
export async function getPeriodPendingClassifications(
  periodId: string,
): Promise<{ documentId: string; docType: string; filename: string;
            verdict: DocumentClassification }[]>;
```

set-based 查詢：經 invoice / allowance 子表的 `tax_filing_period_id = periodId` 關聯到
`documents`，篩 `classifier_hint->>'review_status' = 'pending'` 且 `status='active'`
（走 §4.1 partial index；pending 集本就極小）。供 §6.7 檢查點顯示計數與清單。**只回
`pending`**，不含已 `kept` 但 disagreed 者（後者由 §6.4 inline alert 於 confirm 時呈現）。
childless `other` 不屬任何期別，天然不出現於此查詢。

## 6. UI 層

字級依專案規約：`text-base` 為主、`text-sm` 為輔、禁用 `text-xs`。

### 6.1 上傳入口：第三個選項「其他文件」

3 個上傳入口（`components/document-upload-section.tsx`、
`components/invoice/invoice-upload-dialog.tsx`、portal FAB 的 parent）的分類選擇
新增第三個選項：發票 / 折讓 / **其他文件 (直接上傳)**。

- 選發票 / 折讓：現行 `createInvoice` / `createAllowance` 不變。
- 選其他文件：呼叫 `createDocument`（§5.6）。
- 上傳處理常式在 row 建立後一次性呼叫 `enqueueClassification([...documentIds])`。

portal FAB 是**客戶路徑**、是自我校正的首要受眾，優先確保其體驗。

### 6.2 客戶端校正佇列（核心新 UI）

新檔：`components/document-classifier-queue.tsx`（portal 內），列出該 client
`review_status='pending'` 的文件，每筆一張卡片，客戶有空再逐筆處理。**非 modal、
非阻擋**，是一個常駐清單頁（例：portal 側欄「待您確認」入口）。

卡片內容：
- 左：縮圖（沿用 `components/upload-queue-list.tsx` 的 pattern）
- 中：檔名 + 平語化說明（client tone）
- 右：依 verdict 變體呈現動作

**卡片變體 / 動作**：
- A. verdict 為 invoice/allowance 但與選擇不一致（doc type 或 in/out）：
  `[改為 verdict 的類型/方向]` / `[維持原選擇]`
- B. verdict='other'：「這份文件看起來不是統一發票或折讓單。」
  `[改為其他文件 (收進文件庫，不歸發票/折讓)]` / `[維持原選擇]`
- C. 僅低 / 中信心、方向一致：「我們不太確定這份文件的分類，請您確認。」
  `[確認無誤]` / `[改為…]`
（direct-other 的反向建議**不**進此急迫佇列；它以安靜建議形式呈現於 `/documents` 列表，見 §5.6 / §6.5）

文案依 tone 切換（client 平語化 / firm 簡潔可用術語）。`voided=true` 時加一條低調
文字徽章「此發票看似已作廢」，不影響主動作（v1 選配）。

> 與前一版的差異：**沒有**上傳當下的同步 batch-review dialog。客戶先看到上傳結果，
> 校正在佇列裡非同步進行；延遲與 Gemini 健康度對上傳體驗完全隱形。

### 6.3 側欄入口

1. **「待您確認」**（急迫佇列 §6.2 入口）：**僅 `components/portal-sidebar.tsx`（client）**。
   徽章顯示該 client `review_status='pending'` 文件數（走 §4.1 partial index）。事務所**不**設
   此扁平佇列入口；事務所對同一批 pending 的處理走 §6.7 per-period 檢查點（申報前、依期別範圍），
   避免與 §6.7 重複、也不提前做被歸為 v2 的跨客戶總覽。
2. **「其他文件」**（`/documents` 列表 §6.5 入口）：**`portal-sidebar.tsx`（client）與
   `firm-sidebar.tsx`（事務所）皆加**。徽章顯示該 client `doc_type='other'` 文件數。
   **portal 版**：瀏覽 + 刪除（**無 promote**）。**事務所版**：瀏覽 + 刪除 + promote（手動選期別），
   亦為 direct-other 漏接（含安靜建議）的瀏覽式後路。

### 6.4 審核 dialog 顯示分類不符旗標

`components/invoice-review-dialog.tsx` 與 `components/allowance-review-dialog.tsx`：
當對應 document 的 `classifier_hint.disagreed === true`（即使客戶選了 keep），於表單
頂端渲染一條 inline `Alert`（shadcn `default` variant，提示但不警示）：

> 「上傳時系統判斷此文件為 X，但選擇為 Y，請於確認前再次核對分類。」

僅資訊性、不阻擋；字級 `text-sm`。這是給審核端的最後一道可見提示，不是主校正管道
（主管道是客戶佇列）。

### 6.5 `/documents`「其他文件」列表頁（client + firm 共用，動作依角色分流）

新檔：`app/firm/[firmId]/client/[clientId]/documents/page.tsx`，列 `doc_type='other'`
的文件（含 direct-other 上傳與 demote 而來者）。route 在 `client/[clientId]/` 共用 layout 下、
依角色 render：**client（portal）與 firm（事務所）皆可進**，但**動作集依角色分流**（見下）。

- **欄位**：縮圖、檔名、`doc_date`、`classifier_hint` 摘要（verdict + confidence）、操作
- **client（portal）動作**：**僅瀏覽 + 刪除**（清理自己誤上傳的檔案；soft delete + 清 storage）。
  **不含 promote**：promote 需手動指定期別（見下），屬會計師判斷。
- **firm（事務所）動作**：瀏覽 + 刪除 + **`promoteFromOther`**（重分類為發票 / 折讓；
  **需手動指定 in/out 與期別**、會觸發 OCR）。
- **期別手動指定（不 auto-derive）**：`other` 無期別、OCR 又被略過故無可信日期；promote 時
  由事務所人員手動選期別。v1 刻意不從日期自動推導（最佳自動化做法未定）。
- **安靜建議 chip**：若該 row 的 `classifier_hint.disagreed=true` 且 verdict 為 invoice/allowance
  （反向檢查，§5.6）：**firm 端**呈現「看起來像發票 / 折讓，要轉嗎？」chip，點擊走
  `promoteFromOther`（選期別）—— direct-other 誤標的**主要修正點**；**client 端**同訊號改為
  **資訊性**（「這份文件看起來像發票，您的會計師可協助歸入」），無 promote 動作。
- **排序**：`created_at DESC`；**分頁**：沿用 `usePaginatedPeriodInvoices` SWR pattern
- 因 direct-other 加入，此頁是真正的文件庫入口，非僅孤兒收容所

### 6.6 審核端的 demote / convert 後路

事務所員工在 invoice / allowance 的 review dialog 或列表，可對單筆文件執行
`demoteToOther` / `convertDocType`（§5.5 同一組 service 函式），作為 false-agree
漏網時的人工修正後路。與客戶佇列共用邏輯，只是入口不同。

### 6.7 事務所端 per-period 分類待確認檢查點（客戶漏處理的後路）

新檔：`components/period-classification-review.tsx`，掛在期別頁、緊鄰 Phase 7 的
`components/period-voucher-generation.tsx`（報表 / 草稿分錄控制項旁）。

- 徽章「分類待確認：N」顯示該期別 `review_status='pending'` 文件數
  （`getPeriodPendingClassifications`，§5.7），沿用 Phase 7 freshness 徽章樣式。
- 展開為清單，每筆提供與 §5.5 / §6.2 相同的處理動作（事務所端走同一組 service 函式）。
- **定位**：客戶端佇列（§6.2）仍是主校正管道；本檢查點是**申報前的自然 QA 後路**，
  讓事務所在客戶漏處理時補上，避免誤分類流入 TET_U。不違反「校正面向客戶」原則
  （事務所對申報負責，申報前把關是其既有職責）。
- 僅列 `pending`；無 schema 變更。
- **periodless `other` 的盲區提醒（粗粒度）**：本檢查點經子表 period 關聯，故**看不到**無子表、
  無期別的 `other`（含被誤標為 `other` 的真發票）。為補此盲區，檢查點旁另顯一條**客戶層級**
  粗提醒「本客戶有 N 份其他文件（含 M 份疑似發票），申報前建議檢視」連到 `/documents`。刻意
  粗粒度（非精準歸期）：`other` 的 OCR 被略過、無可信日期可對應期別。

> **精準歸期為 v2**：若要把疑似發票的 `other` 精準帶到「對應期別」的檢查點，需讓反向檢查
> 額外回傳日期（classifier 本就讀檔），以 `doc_date` 為橋；v1 僅做上面的粗提醒。

> **不做 firm-wide 跨客戶總覽**（§2 範圍外）：v1 把後路綁在「申報正確性真正重要的時點」
> （期別頁），而非另開一個 always-on 的跨客戶監控頁。跨客戶彙整留待 v2。

## 7. Eval Harness

目標：收約 50 份真實上傳 + ground truth，量測分類器準確率，作為「是否值得把信心
門檻調更嚴 / 未來是否升級為更強提示」的依據。

**新檔**：
- `tests/fixtures/classifier/README.md`：收樣指引（匿名化、敏感欄位）
- `tests/fixtures/classifier/manifest.json`：起始 `[]`，填入
  `{ filename, ground_truth: { docType, inOrOut, voided }, notes }[]`
- `tests/fixtures/classifier/.gitignore`：排除影像檔
- `tests/integration/document-classifier.eval.ts`：讀 manifest、逐檔呼叫
  `classifyDocument()`、算 per-class precision/recall + 整體準確率、印表格。
  **manifest 為空時 skip**（CI 不會 fail）
- `lib/services/document-classifier.test.ts`：parsing 層單元測試（mock fetch、Zod 驗證、
  錯誤路徑），不打真 Gemini

**非**回歸測試，是量測工具。

## 8. 改動清單一覽

| 檔案 | 改動 |
|---|---|
| `supabase/migrations/<ts>_add_classifier_hint_to_documents.sql` | NEW — JSONB 欄位 + partial index |
| `supabase/database.types.ts` | regenerate（使用者執行）|
| `lib/domain/document.ts` | 加 `classifierHintSchema` + 擴充 document schema |
| `lib/services/document-classifier.ts` | NEW — `classifyDocument` 純函式 + `enqueueClassification` server action |
| `lib/services/document-classifier.test.ts` | NEW — 單元測試 |
| `supabase/functions/classification-worker/` | NEW — 獨立 pgmq worker（鏡像 extraction-worker）|
| `supabase/migrations/<ts>_create_classification_queue.sql` | NEW — pgmq `document_classification` queue |
| `lib/services/document.ts` | 加 `resolveClassificationKeep` / `switchInOrOut` / `convertDocType` / `demoteToOther`（客戶+事務所）/ `promoteFromOther`（**事務所端、手動期別**）（Drizzle 交易）+ `getPeriodPendingClassifications` read helper |
| `components/document-upload-section.tsx` | 加「其他文件」選項 + 上傳後 `enqueueClassification` |
| `components/invoice/invoice-upload-dialog.tsx` | 同上（firm tone）|
| Portal upload parent（`app/firm/[firmId]/client/[clientId]/portal/...`）| 加「其他文件」選項 + enqueue（client tone）|
| `components/document-classifier-queue.tsx` | NEW — 客戶端校正佇列 |
| `components/portal-sidebar.tsx` / `components/firm-sidebar.tsx` | portal 加「待您確認」(佇列) +「其他文件」；firm 僅加「其他文件」(佇列改走 §6.7 檢查點) + 徽章 |
| `components/invoice-review-dialog.tsx` / `components/allowance-review-dialog.tsx` | 顯示 disagreed 旗標 + 審核端 demote/convert 後路 |
| `app/firm/[firmId]/client/[clientId]/documents/page.tsx` | NEW —「其他文件」列表（client：瀏覽+刪除；firm：+promote 手動期別）|
| `components/period-classification-review.tsx` | NEW — 事務所端 per-period 待確認檢查點 + periodless `other` 粗提醒 + 期別頁掛載 |
| `tests/fixtures/classifier/*` + `tests/integration/document-classifier.eval.ts` | NEW — eval scaffolding |

> **`createInvoice` / `createAllowance` 不在清單內**：optimistic 模型下其建立邏輯完全不變。

## 9. Reuse 既有

- shadcn `Dialog` / `Alert`（`components/ui/`）
- 縮圖渲染（`components/upload-queue-list.tsx`、`dropzone.tsx`）
- Gemini fetch、MIME allowlist、base64 boilerplate（`lib/services/gemini.ts`）
- pgmq enqueue 模式（`lib/services/bulk-extraction.ts` 的 `send_batch`）
- worker 結構、`documents` bucket 下載、`toDocumentsKey`（`supabase/functions/extraction-worker/`）
- Drizzle 交易（`lib/db/`，Phase 6.5）；既有 `createDocument`（`lib/services/document.ts`）
- Storage path convention `/{firmId}/{clientId}/{periodYYYMM}/`（Phase 5.6）
- Auth + firm/client 授權（Phase 6b RLS；`lib/services/invoice.ts` 的 `assertCallerCanAccessClient`）
- Test fixture helpers（`tests/utils/supabase.ts`）

## 10. 驗證

於 worktree 執行：

1. `npm run lint` — 型別 + ESLint 通過
2. `npm run test:run` — 單元測試通過；eval harness 在 manifest 空時 skip
3. `npm run dev` — 手動瀏覽器驗證：
   - **上傳一致（高信心）**：上傳清晰進項 invoice + `in=in` → 立刻見於期別頁；佇列無此筆；
     `classifier_hint` 寫入但無 `review_status`
   - **上傳不一致**：上傳銷項 invoice 但選進項 → 立刻見於期別頁（照原選擇）；數秒後佇列
     出現一筆 → 點「改為銷項」→ 子表 `in_or_out` 更新、離開佇列、`resolution='switched_in_out'`
   - **doc type 不符**：上傳折讓單到 invoice 流程 → 佇列卡片 → `[改為折讓]`（convert）→
     原 invoice 子表刪除、建 allowance 子表、`doc_type='allowance'`、`ocr_status='pending'`
   - **verdict='other'**：上傳收據相片走 invoice → 佇列卡片 →「改為其他文件」→ 子表刪除、
     `doc_type='other'`、`/documents` 多一筆；或「維持原選擇」→ 留 invoice、`disagreed=true`
   - **低信心一致**：上傳模糊但方向正確的 invoice → 佇列出現「請確認」卡 →「確認無誤」→
     `resolution='kept'`、離開佇列
   - **direct-other 上傳（genuine other）**：選「其他文件」上傳保險帳單 → 無子表、不進期別頁、
     進 `/documents`、OCR 略過；反向檢查跑但不誤判 → 急迫佇列與徽章皆無變化
   - **direct-other 反向建議（誤標）**：選「其他文件」上傳一張統一發票 → 反向檢查覺得像 VAT →
     **不**進急迫佇列 / 不計徽章；`/documents` 該列出現安靜「要轉嗎？」chip（firm 端可點、client 端僅資訊性）
   - **`/documents` promote（事務所端、手動期別）**：事務所在 `/documents` 對一筆 other 點
     「重分類為發票(進項)」→ **手動選期別** → 建子表、`doc_type='invoice'`、OCR 觸發、可後續 review/confirm
   - **client 端無 promote**：客戶 `/documents` 只見瀏覽 + 刪除；疑似發票的 other 僅顯示資訊性提示、無 promote 鈕
   - **periodless 盲區粗提醒**：事務所進期別頁 → 除「分類待確認：N」外，另見「本客戶有 N 份其他文件
     （含 M 份疑似發票）」粗提醒 → 連到 `/documents`
   - **分類失敗**：暫時弄壞 `GEMINI_API_KEY` → 文件照客戶選擇走、`classifier_hint.error` 寫入、
     佇列不出現、徽章不變
   - **延遲穩健**：人為延遲 / 停掉 classification-worker → 上傳與期別頁完全不受影響，
     佇列只是稍後才出現項目
   - **審核 dialog 旗標**：開一筆 `disagreed=true`（客戶選 keep）的 invoice → 表單頂端見 inline alert
   - **事務所端 per-period 後路**：客戶上傳一筆不一致 invoice 但不處理佇列 → 事務所進該期別頁，
     見「分類待確認：1」→ 展開執行 convert / switch / demote → 計數歸零、該筆離開客戶佇列
   - **電子發票匯入不分類**：跑一次電子發票匯入 → 匯入的 row 不進客戶佇列、不進 per-period 檢查點
   - **側欄徽章**：徽章數隨佇列處理即時更新
4. psql 抽查：
   ```sql
   SELECT id, doc_type, classifier_hint FROM documents
   WHERE classifier_hint IS NOT NULL ORDER BY created_at DESC LIMIT 10;
   ```
5. **既有流程不退步 smoke**：上傳 invoice → OCR → review → confirm → 期別頁、TET_U 匯出；
   allowance 同樣跑一次；電子發票匯入路徑（`processElectronicInvoiceFile`）不受影響

## 11. 分支 / commit

- 依 memory `feedback_branch_workflow`：開新 feature branch（例 `feature/upload-classifier`），不直接動 main。
- 依 memory `feedback_separate_commits`：拆成可讀的數個 commit（schema → 純函式/worker → 服務動作 → UI → eval）。
- 依 memory `feedback_no_apply_migration`：migration .sql 寫好後**不**自動 `supabase migration up`
  或 regenerate types，等使用者執行。

## 12. 依賴與時序

本案啟動條件 = Voucher `VOUCHER_JOURNAL_ENTRY_PHASED_PLAN.md` 的 **Phase 5.5 / 5.6 / 6a /
6b / 6.5** 完成（皆已完成）：
- **Phase 5.5 / 6b**：`documents` 為 CTI 父表，`createInvoice` / `createAllowance` 已 documents-first
  （內部 coupled）、`document_id` 為 `NOT NULL UNIQUE`。classifier overlay 直接在這些 row 上標註。
- **Phase 5.6**：storage 已收斂到 `documents` bucket，classification-worker 與 extraction-worker
  都從同一 bucket 下載。
- **Phase 6.5**：Drizzle 交易層，供 §5.5 的 convert / demote / promote 多表原子動作使用。
- **Phase 6a.1**：`sync_documents_cache_from_subtables` trigger 維持 `documents.amount` / `doc_date`
  與子表同步；demote / convert 改 doc_type 後此 cache 行為仍正確（childless other 由父表自身為真實來源）。

Phase 7（期別批次分錄）與本計畫正交：分錄只對已判定且有子表的 invoice / allowance 產生，
`other` 不產生分錄。實作前 `git pull` 取最新 schema 並確認上述 Phase 已合。

## 13. v2 路線（暫不實作）：classifier-first（免上傳分類選擇）

> **狀態：構想，短期不做。** 記錄於此以保留脈絡；本計畫 (Model A overlay) 是其前置條件。

**構想**：分類器已能算出 `doc_type` + `in_or_out`，上傳時要求客戶先挑分類其實與分類器
重複，且對非會計專業的客戶是最大摩擦點。v2 可拿掉上傳分類選擇，由分類器路由，人類改為
**事後確認**而非**事前挑選**。

**為何吸引人**：把人類從「originate 一個類別」（recall，難、易錯）換成「verify 一個機器
提案」（recognition，較易、可解釋，例如「買方統編是貴公司，所以這是進項，對嗎？」）。
這可能產出**比目前盲選更好**的人類訊號，同時降低負擔。

**為何現在不做（gating 條件）**：
- 拿掉 pick 等於拿掉「人機交叉比對」這個讓錯誤現形的第二訊號；分類器變成唯一裁判。
  唯有在**校準過的信心 (calibrated confidence)** 與**高信心誤判率**夠低時才安全。
- 門檻是**逐欄位**的：`in_or_out` 是最高風險、最難的一欄（相對於 client、可能買賣雙方統編
  皆不符而本質模糊）；可能 invoice↔allowance 早已夠準、in/out 仍需人類確認。
- 量測工具就是 §7 eval harness；它要回答的不只是「軟警告能否升級硬阻擋」，更是這個
  pick vs no-pick 決策。而所需數據（不符率、per-class precision/recall、信心校準）**正是
  本計畫 (Model A) 跑起來後才產得出**。故 **Model A 是 v2 的 on-ramp，不是競品**。

**漸進路徑（非重寫）**：v2 復用本計畫所有機制（分類器、佇列、promote/demote/convert/switch、
信心欄位），只需 (1) 上傳 UI 讓 pick 變選配 / 拿掉、(2) 未選時由分類器驅動子表建立、
(3) 把「確認」從例外變主流程（高信心自動路由、中低信心才確認）。可**逐欄位、逐信心** graduate。

**品牌 / 責任考量（可能刻意保留人類確認）**：定位是「會計師把關」、AI 為內部優化
（memory `feedback_ai_messaging_positioning`）。讓 AI **靜默**決定影響稅務的分類，與「AI 提案、
人類確認」是兩回事；即使分類器夠準，影響 `in_or_out` / TET_U 的欄位仍可能**刻意**保留人類
確認作為專業把關的一環，而非技術做不到。
