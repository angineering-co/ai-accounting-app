# 上傳分類器 / 文件管理 — 階段式實作計畫

> **狀態追蹤**
> - ✅ PR-1a 已完成（「其他文件」上傳 + `/documents` 列表 + 文件詳情 / 預覽 dialog）
> - 🚧 PR-1b 進行中（服務層 promote / demote / convert / switch + 整合測試全數完成；UI 本階段只接 promote，convert / demote / switch 僅服務層；OCR 觸發延後）
> - ⬜ PR-2 未開始（分類器核心：migration + 純函式 + worker + hint UI）
> - ⬜ PR-3 未開始（eval scaffold）
> - ⬜ 後續步驟 A 未開始（桌機客戶維持 `/documents` only，不加期別頁第 5 張卡）
> - ⬜ 後續步驟 B 未開始（最後一步：mobile FAB 加「其他文件」選項；需 PR-2 分類器反向檢查先上線）
>
> **配套文件**：[`UPLOAD_CLASSIFIER_PLAN.md`](./UPLOAD_CLASSIFIER_PLAN.md) — 已定案的設計提案。本文件把該設計切成可獨立交付、可獨立驗證的數個 PR，並依使用者要求重排執行順序。所有 §x.y 章節編號皆指向設計提案。

## Context

設計提案 `UPLOAD_CLASSIFIER_PLAN.md` 原本的 commit 順序為「schema → 純函式 / worker → 服務動作 → UI → eval」（分類器先行）。**本計畫依使用者要求把順序倒過來**：先交付與分類器無關的「文件管理介面」（上傳「其他文件」+ `/documents` 列表 + 管理動作），讓客戶與事務所**即刻能手動上傳、檢視、刪除、重分類文件**；分類器本身（hint 標註）留到後面，屆時只是在同一個管理介面上「額外」疊加自動提示，把現在的全手動流程變成主動提示。

依賴方向其實順著這個重排：管理介面不依賴分類器，分類器依賴管理介面（hint 要有 `/documents` 與檢查點才有地方呈現與處理）。

**已驗證的前置事實（決定本重排為低風險）**：
- `doc_type='other'` 已存在於 enum / Zod / DB（`lib/domain/document.ts:6`）。
- `createDocument` 已可直接建立 `doc_type='other'`（`type='NON_VAT'`、略過 OCR），**無需改服務層**（`lib/services/document.ts`）。
- childless `other` document 已合法（`invoices/allowances.document_id NOT NULL UNIQUE` 是子表→父表方向，不強制父表有子；§4.1）。
- 因此 **PR-1a / PR-1b 完全不需要 migration**。`classifier_hint` 欄位只有在 PR-2 分類器進場時才需要。

**刻意的取捨**：PR-1a / PR-1b 完全不碰 `classifier_hint`，使前期交付不動 schema。代價是 PR-1b 的管理動作在 PR-2 會有一次小幅追加（補上 `review_status='resolved'` 標記）。此追加極小，換得前期 PR 乾淨。

**啟動條件**：Voucher 計畫的 Phase 5.5 / 5.6 / 6a / 6b / 6.5 皆已完成（documents-first、storage 收斂至 `documents` bucket、Drizzle 交易層），詳見設計提案 §11。

依 memory：開新 feature branch、不動 main；拆可讀的數個 commit；migration .sql 不自動套用、types 不自動 regenerate。

---

## PR-1a — 「其他文件」上傳 + `/documents` 列表 + 文件詳情 / 預覽 dialog

**目標**：讓客戶與事務所能上傳「其他文件」（非發票 / 折讓），並在 `/documents` 列表瀏覽、刪除、開啟詳情 / 預覽。**無 schema、無分類器**。這是「能手動管理文件」的最小可用面。

**改動**：
- **「其他文件」上傳入口放在 `/documents` 頁本身**（**修正設計提案 §6.1**）：設計提案原列「加進 3 個既有上傳入口」，但實讀程式碼後發現那 2 個元件（`components/document-upload-section.tsx`、`components/invoice/invoice-upload-dialog.tsx`）皆為**期別範圍**的上傳面（前者是 portal 期別頁的 4 張固定 type+inOrOut 卡、無類型選擇器；後者是 firm 期別頁、期別選擇器鎖定該期），而「其他文件」是**無期別、childless、client 範圍**。把無期別概念塞進期別面會洩漏期別語意（在期別頁丟的 `other` 其實不屬該期）。故「其他文件」上傳改放在 `/documents` 頁自身的上傳控制（client 範圍、無期別，與 `other` 語意對齊，且與瀏覽 / 管理同頁）。
  - 選「其他文件」→ `createDocument(doc_type='other', type='NON_VAT')`，建 childless row、略過 OCR；storage key 走 client 範圍路徑（無 periodYYYMM 段，實作時定案，例如 `/{firmId}/{clientId}/other/`）。
  - **客戶端曝光刻意分階段**：PR-1a 階段「其他文件」上傳**只**出現在 `/documents` 頁。客戶主要上傳流程（mobile FAB、桌機期別頁的 4 張 type 卡）**先不**加此選項，避免一上線就把客戶導向「其他文件」而衍生誤用；先以 `/documents` 單一面觀察、調整文案與行為。客戶在 FAB / 桌機的曝光延後到後面的步驟（見下方「後續步驟：客戶端 其他文件 上傳曝光」）。維持「期別頁＝屬於申報期的 VAT 文件、`/documents`＝其餘無期別文件」的分界。
- **`/documents` 列表頁**（§6.2 / §6.3 的瀏覽 + 刪除部分）：新檔 `app/firm/[firmId]/client/[clientId]/documents/page.tsx`，列該 client `doc_type='other'` 文件，`created_at DESC`，分頁沿用 `usePaginatedPeriodInvoices` 模式。頁內含上述「其他文件」上傳控制（client 與 firm 皆可用）。
  - **客戶端（portal）**：縮圖、檔名、`doc_date`、刪除（soft delete + 清 storage）。不顯示任何分類資訊。
  - **事務所端（firm）**：本 PR 先做與客戶端相同的瀏覽 + 刪除；分類摘要 / chip / promote 等留待後續 PR。
- **文件詳情 / 預覽 dialog**（本 PR 新增需求）：新檔 `components/document-detail-dialog.tsx`，點列表某筆開啟。
  - 有原始檔時內嵌影像 / PDF 預覽（reuse 既有預覽元件 `components/file-preview-dialog.tsx` 與傳票詳情頁內嵌預覽的渲染方式，commit f3453b2）。
  - 顯示欄位：檔名、`doc_date`、`doc_type`、`created_at`、上傳者。
  - **為日後欄位編輯預留結構**：本 PR 欄位先唯讀，但 dialog 以「可切換為可編輯表單」的形狀搭建（沿用 `invoice-review-dialog.tsx` 的 shadcn Form + react-hook-form pattern），日後加 `doc_date` / 標註 / 備註等可編輯欄位時不需重構版面。
- **sidebar 入口**（§表 8）：`components/firm-sidebar.tsx` 與 `components/portal-sidebar.tsx` 各加「其他文件」入口 + 徽章（該 client `doc_type='other'` 且 `status='active'` 計數）。
- **read helper**：`lib/services/document.ts` 加列「其他文件」的查詢（client scope、分頁），及 soft-delete 動作（沿用既有 soft delete + storage 清理慣例）。

**驗證**：
- `npm run lint`、`npm run test:run`。
- 手動：客戶選「其他文件」上傳保險帳單 → 立刻見於 `/documents`、不進期別頁、OCR 略過 → 開詳情 dialog 見預覽與欄位 → 刪除後從列表消失、storage 檔清掉。
- 事務所端 `/documents` 能瀏覽同一份、能刪除。
- sidebar 徽章計數正確。
- 不退步 smoke：發票 / 折讓上傳、OCR、review、confirm、期別頁、TET_U 匯出、電子發票匯入皆不受影響。

**退出條件**：客戶與事務所能上傳「其他文件」並在 `/documents` 瀏覽 / 預覽 / 刪除；詳情 dialog 已搭好可擴充為欄位編輯的結構；既有發票 / 折讓流程不退步。

---

## PR-1b — 事務所端文件管理動作（手動重分類）

**目標**：給事務所端「修正既有文件分類」的動作。這些動作日後是分類器不符的處理出口，但本身作為純手動管理也成立（員工發現分類錯誤即可手動修）。**仍無 schema、無分類器**。

**改動**（§5.4，皆事務所端、Drizzle 交易、非 PostgREST RPC）：
- `lib/services/document.ts` 新增四個動作，皆以 `assertCallerCanAccessFirm` 守住「事務所員工專屬」（擋掉 client 角色）：
  - `switchInOrOut(documentId, target: 'in'|'out')`：子表 `in_or_out` 設為明確 `target`（非 toggle，重複點收斂同值）。已 OCR 過（`extracted_data` 非空）則把子表退回 `status='uploaded'`（舊擷取結果已被舊方向帶偏而失效，§5.4）。
  - `convertDocType(documentId, { docType, inOrOut })`（invoice↔allowance）：交易內刪原子表 + 建目標子表（`status='uploaded'`）+ 翻 `doc_type` + `ocr_status='pending'`。
  - `demoteToOther(documentId)`：交易內刪子表 + 翻 `doc_type='other'` / `type='NON_VAT'`、清 `ocr_status` / `amount`、把子表 `filename` 抄回父表（`other` 的檔名以父表為準）。
  - `promoteFromOther(documentId, { docType, inOrOut, taxFilingPeriodId })`：交易內建子表（`status='uploaded'`、**手動指定期別**、不 auto-derive；invoice 由期別帶出 `year_month`）+ 翻 `doc_type='VAT'`、清父表 `filename`。
  - **Guard**：要求子表尚未 confirmed 且無對應 journal entry，否則擋下。
- **OCR 觸發刻意延後（本 PR 不碰 pgmq）**：原設計讓這些動作「顯式重排 / 觸發 OCR」。經討論後決定 PR-1b **不直接入 pgmq 佇列**，改為把重分類後的子表停在 `status='uploaded'`（與新上傳同態），由期別頁既有的「AI 提取」按鈕統一擷取。好處是 PR-1b 完全不依賴 `pgmq_public`（本機 PostgREST 預設未開放該 schema），保持乾淨；代價是重分類後 OCR 不會自動跑，需員工再按一次期別的「AI 提取」。自動觸發留待後續（見下方 PR-2 追加）。
- **UI 範圍（本階段只接 promote）**：事務所端 `/documents`（PR-1a 僅列 `doc_type='other'`）加上 promote 列操作（升級為發票 / 折讓，選 in/out + 期別）。`convert` / `demote` / `switch` 作用於 invoice / allowance 文件，這些尚未出現在 `/documents` 列表，**本 PR 只交付其服務層 + 測試，UI 接線留待後續**（屆時 firm `/documents` 擴充為列全 doc type，或在期別頁列操作上接）。

**驗證**：
- `tests/integration/services/document-reclassify.test.ts`：promote 建子表（指定期別、`year_month` 帶出、`status='uploaded'`）翻 doc_type、清父表 filename；promote 跨客戶期別被擋；convert 刪原子表 / 建目標子表（`uploaded`）/ `ocr_status='pending'`、拒絕轉同型；demote 刪子表翻 other、抄回 filename、清 ocr/amount；switch 明確 target、已擷取者退回 `uploaded` 並 `ocr_status='pending'`、未擷取者維持、同值為 no-op；已 confirmed / 有 journal entry 時 guard 擋下且原狀不動。
- 手動：把一份「其他文件」promote 成發票（選 in/out + 期別）→ 建子表、進期別頁、按期別「AI 提取」後 OCR 跑。
- 不退步 smoke 同 PR-1a。

**退出條件**：服務層 promote / convert / demote / switch 交易原子、guard 正確、整合測試綠燈；事務所能在 `/documents` 手動 promote；既有流程不退步。（convert / demote / switch 的 UI 接線與重分類自動觸發 OCR 列為後續。）

---

## PR-2 — 分類器核心（migration + 純函式 + worker + hint UI）

**目標**：把分類器接上，對每筆人工上傳於背景中立判決並標註 `classifier_hint`，在既有管理介面疊加自動提示。對應設計提案 §4 / §5.1–5.3 / §5.5–5.6 / §6.3–6.5。

**改動**：
- **Migration**（.sql 寫好不自動套用）：`<ts>_add_classifier_hint_to_documents.sql`（JSONB 欄位 + §4.1 partial index）、`<ts>_create_classification_queue.sql`（pgmq `document_classification` queue）。`lib/domain/document.ts` 加 `classifierHintSchema`。
- **純函式**：`lib/services/document-classifier.ts` 的 `classifyDocument`（中立 prompt、依 tax_id 判 in/out、偵測作廢、Zod parse）+ `lib/services/document-classifier.test.ts` 單元測試。
- **Enqueue**：`enqueueClassification(documentIds)`（pgmq `send_batch`，兼批次重跑 `unclassified`）；上傳處理常式在 row 建立後一次性 batch enqueue（含 direct-other 的反向檢查）。
- **Worker**：`supabase/functions/classification-worker/`（獨立 Deno edge function，鏡像 extraction-worker；一律寫 `review_status`；> 15MB → `unclassified`）。**獨立部署**。
- **hint UI**：
  - 事務所端 `/documents` 疊加 `classifier_hint` 摘要 + 反向檢查 chip（§6.3）。
  - per-period 檢查點 `components/period-classification-review.tsx`（§6.4）+ periodless `other` 粗提醒。
  - 審核 dialog `disagreed` 旗標（`invoice-review-dialog.tsx` / `allowance-review-dialog.tsx`，§6.5）。
- **PR-1b 動作追加**：補上 `review_status='resolved'` + `resolution` 標記；新增 `resolveClassificationKeep`、`getPeriodPendingClassifications`（含 unclassified 分組）。
- **PR-1b 動作 benchmark 寫回（重要、目前無處追蹤）**：`classifier_hint` 欄位上線後，promote / convert / demote / switch 這四個重分類動作**必須把員工最終採取的動作寫回 `classifier_hint`**（例如 `resolution` / `final_doc_type` / `final_in_or_out`），與分類器當初的 `verdict` 並存。如此每筆人工修正都成為一筆「AI 建議 vs 實際動作」的標註，自然累積出 benchmark 資料集（餵 PR-3 eval、§7 rollout gate）。**這是 PR-1b 服務動作在 PR-2 的必做追加**，現階段 PR-1b 動作尚未寫任何 hint（欄位還不存在），切勿遺漏。
- **承接 PR-1b 延後項**：PR-2 既已導入分類佇列 / worker 與 pgmq 路徑，重分類動作的「自動觸發 / 重排 OCR」在此一併補上（promote / convert / switch 後直接入擷取佇列，不再只停 `uploaded`）；`convert` / `demote` / `switch` 的事務所端 UI 接線（隨 `/documents` 疊加 hint 一起，把列表擴為列全 doc type 並掛上列操作）亦在此完成。

**驗證**：見設計提案 §10 全部手動情境（一致 / 不一致 / doc type 不符 / verdict='other' / direct-other genuine 與反向 / 客戶端無提示 / periodless 盲區提醒 / unclassified 重跑 / switch target / convert 重排 OCR / 延遲穩健 / dialog 旗標）+ 不退步 smoke。

**退出條件**：每筆人工上傳背景跑分類並標 hint；事務所能在 `/documents` 與 per-period 檢查點看到並處理不符；失敗走 unclassified 可批次重跑；客戶端無任何分類提示；既有流程不退步。

---

## PR-3 — Eval scaffold

**目標**：建立分類器 eval 骨架，供日後「能否開放給客戶自我校正」的 rollout gate（§7）。

**改動**：`tests/fixtures/classifier/{README.md, manifest.json, .gitignore}`、`tests/integration/document-classifier.eval.ts`（manifest 空時 skip）。

**資料來源（與 PR-2 benchmark 寫回相連）**：除人工策劃的 fixture manifest 外，PR-2 讓重分類動作把員工最終動作寫回 `classifier_hint`（見 PR-2「動作 benchmark 寫回」），這批「AI 建議 vs 實際動作」標註即為線上實況 benchmark 的主要來源，供 §7 rollout gate 衡量分類器準度。

**退出條件**：eval harness 可讀 manifest 跑 `classifyDocument` 並算 per-class precision/recall；manifest 空時 skip、不影響 CI。

---

## 後續步驟：客戶端 其他文件 上傳曝光（分階段，刻意延後）

把「其他文件」推到客戶主要上傳流程的時點刻意延後：先讓 `/documents` 單一面（含 firm 管理與 PR-2 分類器反向檢查）穩定、依實際使用調整文案與行為，再逐步擴大客戶曝光。雖然風險不對稱（誤標成發票比誤標成其他文件更糟，故長期想讓「不是發票」的逃生口好按），但仍不希望客戶一上線就被導向「其他文件」而把它當傾倒區。

- **步驟 A（桌機客戶維持 `/documents` only）**：桌機客戶在期別頁仍只有 4 張 type 卡，沒有「其他文件」卡；要丟非發票 / 折讓就到 `/documents`（即討論中的選項 3）。本步驟幾乎無需新建程式（即現況），重點是明確**不**為桌機期別頁加第 5 張 `createDocument` 卡，保留日後再依數據決定。
- **步驟 B（最後一步：mobile FAB 加「其他文件」）**：於 `components/portal-upload-fab.tsx` 的類型選擇加第 5 個選項（文案傾向「其他文件（收據、帳單、看不懂的單據）」助自我分類），選後走 `createDocument`（無期別）。這是客戶最高流量、最顯眼的入口，放在最後：等 `/documents` 體驗定型、且 **PR-2 分類器反向檢查已上線**（能接住被誤標成其他文件的真發票）後再開。FAB 為 `md:hidden`，故本步驟只影響 mobile。

## 後續路線（暫不實作）

見設計提案 §12：R1 開放客戶自我校正、R2 classifier-first（免上傳分類選擇）、R3 精準歸期。
