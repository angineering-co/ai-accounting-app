# Gemini 辨識效能與模型選擇

紀錄 AI 辨識（發票／折讓）的延遲調校過程、最終的模型設定，以及未來換模型時該如何用 eval 做決策。寫給之後要再動這塊的人，避免重蹈覆轍或再憑單一樣本拍板。

## 結論（TL;DR）

- 辨識模型用 **`gemini-3.5-flash` + `thinkingConfig.thinkingLevel: "low"`**。
- 設定集中在兩個檔案的常數，改一行即可調整：
  - `supabase/functions/extraction-worker/index.ts` — 佇列 worker（pg_cron 觸發的正式辨識路徑）
  - `lib/services/gemini.ts` — UI 單張重新辨識的 server action
- 換模型前，**不要靠單一樣本拍板**，跑下面的 eval 量測整體正確率與延遲再決定。

## 背景：23 秒的延遲

log 觀察到單張辨識約需 23 秒。根因是當時用的 `gemini-2.5-flash` **預設開啟 thinking**：在輸出 JSON 前會先花大量內部推理 token，但對這種結構化擷取任務幫助有限。

worker 內 `callGemini` 對任何非 200 回應都會 throw，因此 log 中能成功計時即代表 API 回傳 200。

## Gemini 3.x 的 thinking 參數

Gemini 3.x 以字串列舉 `thinkingConfig.thinkingLevel` 取代舊的數值 `thinking_budget`：

- 列舉值：`minimal | low | medium | high`，預設 `medium`。
- 不要同一請求同時帶 `thinking_budget` 與 `thinkingLevel`。
- 參考：
  - thinkingLevel：https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5#thinking-budget
  - 影像理解：https://ai.google.dev/gemini-api/docs/image-understanding

## 實測：哪個改變真正有效

在 staging 上用同一張「停車費」發票樣本逐一測試（同影像、同 prompt，只換設定）：

| 設定 | 延遲 | 停車費科目 | 結果 |
| --- | --- | --- | --- |
| 2.5-flash（舊，預設 thinking） | 23s | 6113 旅費 | 正確但慢 |
| 3.1-flash-lite + low | 2.3s | 6114 運費 | 誤判 |
| 3.1-flash-lite + medium | 4.2s | 6114 運費 | 誤判 |
| 3.1-flash-lite + high | 7s | 6113 旅費 | 正確但慢 |
| **3.5-flash + low** | **2.9s** | **6113 旅費** | **正確且快（採用）** |

（運費 `6114` 僅用於貨物運送；人員移動的停車、計程車、過路、油資應落在旅費 `6113` 或交通費用 `613212`。）

`3.5-flash + low` 完勝 `3.1-flash-lite + high`：同樣正確，但 2.9 秒 vs 7 秒，且比原本 23 秒快約 8 倍。

## 學到的事

1. **thinking 不等於 OCR。** 讀出影像上的字（含手寫）是視覺編碼器在 forward pass 做的「感知」，thinking 是之後的「推理」。加再多 thinking 也不會讓模糊手寫變清楚。辨識準確度的真正槓桿是模型的視覺能力與影像解析度（`media_resolution`），不是 thinking。

2. **thinking 對「科目判斷」是有門檻效應的弱槓桿。** 科目判斷是辨識中推理最重的步驟。flash-lite 在 `low`／`medium` 都誤判，要拉到 `high` 才對，代價是延遲翻數倍。換更強的模型（`3.5-flash`）在 `low` 即正確，且幾乎不增加延遲。**正確性由模型 capability 提供，比靠 thinking budget 更划算。**

3. **不要用 prompt 補丁逐案修。** 「停車費不是運費」這種規則是 whack-a-mole：只能修看過的錯，規則無上限地長，且新增規則可能讓別的案例退步。會 scale 的做法是：
   - **提升 capability**（換模型／必要時調 thinking）拉高整體分佈的正確率。
   - **一次性標註科目分類法**：給模型的清單目前只有 `6114 運費`，沒有用途說明。為易混淆的科目群加一行用途註解，能一次幫到所有相關分類，這是「教分類法」而非「補單一例外」。
   - **用真實修正回灌 few-shot**：科目是人工複核欄位，員工每次改 AI 的猜測都是一筆標註資料。透過 `classifier_hint` 回寫累積 benchmark，從實際錯誤分佈自我修正，這才是長尾的解法。

4. **n=1 不算數。** 上表是單一樣本，足以決定預設值，但不代表整體錯誤率。LLM 輸出有 run-to-run 變異，正式決策要靠下面的 eval。

## 如何調整與部署

兩個檔案各有兩個常數：

```ts
const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_THINKING_LEVEL = "low"; // minimal | low | medium | high
```

worker 變更需部署後生效（server action 隨 Vercel 部署）：

```bash
# staging（persistent branch，ref 見 supabase/STAGING.md）
npx supabase functions deploy extraction-worker --project-ref <staging-ref>
```

部署後看 `Gemini call took ${ms}ms` log 確認延遲。

## 換模型時的決策方法：eval

把「某張發票猜對了」升級成「模型 X 在 40 張多樣發票上科目正確率 92%、每張 2.9 秒」。這是換模型（例如未來 Gemini 4）或改 prompt 時的決策依據，也是回歸防護。

### 執行方式

- **在本機或手動觸發跑，不進常規 CI。** 它打真實 API（要花錢、需 `GEMINI_API_KEY`）、非決定性、且慢。屬於 benchmark 而非單元測試。快速、免費、決定性的檢查（schema 驗證、`extractAccountCode` 等）才留在 CI。

### 輸入：標註樣本集

每個樣本 = 發票影像 + 餵給 `extractInvoiceData()` 的 context + 人工標註的正解：

```jsonc
{
  "input": {
    "inOrOut": "進項",
    "clientInfo": { "name": "...", "taxId": "12345678", "industry": "餐飲業" }
  },
  "expected": {
    "invoiceType": "手開三聯式",
    "totalAmount": 150,
    "tax": 0,
    "invoiceSerialCode": "AB12345678",
    "date": "2024/09/03",
    "account": ["6113 旅費", "613212 交通費用"],  // 可接受集合，非單一答案
    "deductible": false
  }
}
```

重點：

- **`account` 用「可接受集合」評分**，而非單一字串。停車費落在旅費或交通費用都算對，運費才算錯。
- 樣本約 30 至 50 張，涵蓋會出問題的維度：發票類型（手開二聯式／三聯式／電子發票／收銀機）與**多樣費用類型**（停車、油資、餐費、文具、房租、計程車、規費等）。科目欄位最會分出模型高下，樣本應往科目傾斜。

### 不要把真實發票影像 commit 進 repo

樣本是真實統一發票，含公司名、統一編號、金額等客戶財務資料：

- git 歷史永久保存，會 clone 到每台開發機並推上 GitHub，屬合規問題。
- 二進位影像讓 repo 永久膨脹。Git LFS 解決膨脹但不解決隱私（仍會同步到 GitHub）。

做法：

| 資產 | 進 repo？ | 原因 |
| --- | --- | --- |
| `expected` 標註 JSON | 是 | 純文字、可審查，是真正的 IP，且可被 `classifier_hint` 複用 |
| manifest（樣本 id 對應影像位置） | 是 | 文字指標 |
| 發票影像 | 否 | 真實客戶 PII |

影像本就在 Supabase Storage（`documents` bucket）裡，所以 eval 集不必另存影像，直接用 storage path 引用既有文件即可：

```
tests/fixtures/extraction-eval/
  manifest.json        # [{ id, storagePath, input, expected }]，純文字、commit
  images/              # gitignore，執行時從 Storage 下載
    .gitignore         # *
```

runner 讀 `manifest.json`，執行時從 bucket 下載影像，跑各設定後對照 `expected` 評分。影像不進 git，團隊透過 bucket 共用同一套，只有標註與指標進版控。

權衡：最難的案例（手寫、模糊掃描）正好是最敏感的真實影像。合成或去識別化影像可安全 commit，但無法真實壓測 OCR，會低估模型最容易出錯的情境。因此通常採「真實影像存私有 bucket、本機 gitignore、標註進 repo」。

### Runner

呼叫**與正式相同的 `extractInvoiceData`**，只換設定：

```
for each config in [
    {model: "gemini-3.5-flash",      thinking: "low"},
    {model: "gemini-3.1-flash-lite", thinking: "low"},
    {model: "gemini-3.1-flash-lite", thinking: "high"},
]:
  for each fixture:
    for repeat in 1..3:                 // 量測 run-to-run 變異
      t0 = now
      result = extractInvoiceData(image, mime, input.clientInfo, input.inOrOut, ACCOUNT_LIST)
      latency = now - t0
      score each field: result vs expected
```

重複 3 次是因為 LLM 輸出會漂移，要知道某設定是「穩定正確」還是「剛好猜中」。

### 輸出：決策表 + 失敗清單

決策表：

| 設定 | 科目正確率 | 全欄位正確率 | 一致性 | p50 延遲 | 估算 $/1k |
| --- | --- | --- | --- | --- | --- |
| 3.5-flash + low | 92% | 88% | 98% | 2.9s | ... |
| 3.1-flash-lite + low | 74% | 85% | 90% | 2.3s | ... |
| 3.1-flash-lite + high | 90% | 87% | 95% | 7.0s | ... |

- **科目正確率**：模型的代碼是否落在可接受集合。頭號指標。
- **全欄位正確率**：抓出單一樣本看不到的回歸（例如某模型科目變好但 `invoiceType` 或 `tax` 變差）。
- **一致性**：3 次重複是否給相同答案。低一致性代表不穩，即便平均正確。
- **延遲與成本**：正確率的代價。

失敗清單（可行動的一半）：

```
3.1-flash-lite@low 科目失敗：
  parking-01:  predicted 6114 運費   expected {6113 旅費, 613212 交通費用}
  fuel-01:     predicted 6114 運費   expected {6132 其他費用, 613206 燃料費}
```

呈現錯誤的「模式」而非只有數字，直接餵給上面的一般性修正（科目分類法註解、few-shot）。

### eval 如何幫你決策

1. **用比率取代軼事**：把爭論單張停車費，換成「74% vs 92% 科目正確率」這種決策級數字。
2. **讓權衡顯式化**：正確率、延遲、成本並列，「0.6 秒換 18 個百分點的科目正確率值不值」變成可衡量的選擇。常會看到曲線拐點，例如 3.5-flash@low 完勝 flash-lite@high（更準又更快）。
3. **設門檻**：科目建議要夠準，複核者才會信；低於某準確率反而讓人重查每一筆，AI 變成增加點擊而非節省。eval 告訴你哪些設定過關。
4. **回歸防護**：換模型或改 prompt 後重跑同一套，部署前即知任一欄位的正確率有無變動。
5. **餵養一般性修正**：失敗清單就是科目分類法註解與 few-shot 的輸入，與 `classifier_hint` 回寫累積的是同一批標註資料，並非一次性投入。

成本誠實面：runner 約一個下午即可；**標註樣本才是工**，需具會計判斷的人為每張設定可接受科目集合。但建一次後每次換模型都回本，且這批標註與 `classifier_hint` benchmark 本就同源。

## 待辦

- 建立標註樣本集與 runner，把目前的 n=1 升級成整體錯誤率。
- 為易混淆科目群（如運費 vs 旅費／交通費用）加一行用途註解到送進模型的清單。
- 確認 `classifier_hint` 人工修正回寫持續累積，作為長尾與 few-shot 的資料來源。
