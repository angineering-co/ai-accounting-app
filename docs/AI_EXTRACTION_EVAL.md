# AI 辨識任務的模型 Eval

如何用標註樣本量測 AI 辨識（發票／折讓）的正確率與延遲，作為**每次要換或升級模型時**的決策依據。重點是方法本身，與特定模型無關；不論下次是換 Gemini 新版、調 thinking、改 prompt，還是換到別家模型，都跑同一套 eval 再決定。

這份文件目前描述的是方法與設計；runner 與樣本集尚未建立（見[待辦](#待辦)）。文末附一則實際促成這套方法的案例。

## 為什麼需要

換模型時最容易犯的錯，是拿一兩張發票試一下、看起來對就上線。但是：

- **單一樣本不是決策依據。** LLM 輸出有 run-to-run 變異，一張猜對可能只是運氣。要看的是「在一組多樣樣本上的正確率」。
- **正確率與延遲要一起看。** 更準的設定通常更慢或更貴。沒有量測就無法判斷「多 0.6 秒換多少正確率」值不值。
- **要能防回歸。** 換模型可能讓某個欄位變好、另一個變差。沒有 eval 就看不到。

eval 把「這張猜對了」升級成「模型 X 在 40 張多樣樣本上科目正確率 92%、每張 2.9 秒、一致性 98%」這種決策級數字。

## Eval 的組成

### 執行方式：本機或手動觸發，不進常規 CI

它打真實 API（要花錢、需 API key）、非決定性、且慢（樣本數 × 重複次數 × 設定數 × 每張數秒）。屬於 **benchmark 而非單元測試**，在要選模型或改 prompt 時手動跑（`npx tsx` 或手動觸發的 GitHub Action）。快速、免費、決定性的檢查（schema 驗證、`extractAccountCode` 等）才留在 CI。

### 輸入：標註樣本集

每個樣本 = 來源檔（影像／PDF）+ 餵給 `extractInvoiceData()` 的 context + 人工標註的正解：

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

- **`account` 用「可接受集合」評分**，而非單一字串。例如停車費落在旅費或交通費用都算對，運費才算錯。多數科目有不只一個合理歸屬，用單一正解會誤殺。
- 樣本約 30 至 50 張，涵蓋會出問題的維度：發票類型（手開二聯式／三聯式／電子發票／收銀機）與**多樣費用類型**（停車、油資、餐費、文具、房租、計程車、規費等）。科目欄位最會分出模型高下，樣本應往科目傾斜。
- **標註是唯一的人工成本**，需具會計判斷的人為每張設定可接受答案。但建一次後每次換模型都複用，且這批標註與 `classifier_hint` 回寫的 benchmark 同源，並非一次性投入。

### 輸入不要把真實發票影像 commit 進 repo

樣本是真實統一發票，含公司名、統一編號、金額等客戶財務資料：

- git 歷史永久保存，會 clone 到每台開發機並推上 GitHub，屬合規問題。
- 二進位影像讓 repo 永久膨脹。Git LFS 解決膨脹但不解決隱私（仍會同步到 GitHub）。

做法：

| 資產 | 進 repo？ | 原因 |
| --- | --- | --- |
| `expected` 標註 JSON | 是 | 純文字、可審查，是真正的 IP，且可被 `classifier_hint` 複用 |
| manifest（樣本 id 對應影像位置） | 是 | 文字指標 |
| 來源影像 | 否 | 真實客戶 PII |

影像本就在 Supabase Storage（`documents` bucket）裡，所以 eval 集不必另存影像，直接用 storage path 引用既有文件即可：

```
tests/fixtures/extraction-eval/
  manifest.json        # [{ id, storagePath, input, expected }]，純文字、commit
  images/              # gitignore，執行時從 Storage 下載
    .gitignore         # *
```

runner 執行時從 bucket 下載影像，跑完即可清掉本機副本。影像不進 git，團隊透過 bucket 共用同一套，只有標註與指標進版控。

權衡：最難的案例（手寫、模糊掃描）正好是最敏感的真實影像。合成或去識別化影像可安全 commit，但無法真實壓測 OCR，會低估模型最容易出錯的情境。因此通常採「真實影像存私有 bucket、本機 gitignore、標註進 repo」。

### Runner：全自動評分，不靠人工讀結果

關鍵設計：**評分是程式自動做的**。你不可能手讀 40 張 × 3 次重複 × 數個設定的原始輸出。runner 呼叫**與正式相同的 `extractInvoiceData`**，逐欄位以程式比對 `expected`，自動彙總成指標。人只看最後的彙總表，以及（很短的）失敗清單。

```
for each config in CANDIDATE_CONFIGS:        // 例如「現行設定」vs「候選設定」
  for each fixture:
    for repeat in 1..N:                      // 量測 run-to-run 變異
      t0 = now
      result = extractInvoiceData(image, mime, input.clientInfo, input.inOrOut, ACCOUNT_LIST)
      latency = now - t0
      scoreFields(result, expected)          // 程式自動比對，非人工
  aggregate()                                // 自動算正確率、一致性、延遲分位數
```

逐欄位評分規則（皆程式判定）：

- **account**：代碼是否落在可接受集合（比對代碼即可，忽略名稱）。
- **數值欄位**（totalAmount／tax／totalSales）：數值相等。
- **invoiceSerialCode／date**：正規化後字串相等。
- **invoiceType／taxType／deductible**：列舉值相等。
- **summary**：自由文字，難以精確比對，預設略過或另以語意相似度判定，不計入主要正確率。

重複 N 次（例如 3）是因為 LLM 輸出會漂移，要分辨某設定是「穩定正確」還是「剛好猜中」。

### 輸出：決策表 + 失敗清單

runner 自動產出決策表：

| 設定 | 科目正確率 | 全欄位正確率 | 一致性 | p50 延遲 | 估算 $/1k |
| --- | --- | --- | --- | --- | --- |
| 現行設定 | 92% | 88% | 98% | 2.9s | ... |
| 候選 A | 74% | 85% | 90% | 2.3s | ... |
| 候選 B | 90% | 87% | 95% | 7.0s | ... |

- **科目正確率**：頭號指標（科目是辨識中推理最重、模型差異最大的欄位）。
- **全欄位正確率**：抓出單一樣本看不到的回歸（某設定科目變好但 `invoiceType` 或 `tax` 變差）。
- **一致性**：N 次重複是否給相同答案。低一致性代表不穩，即便平均正確。
- **延遲與成本**：正確率的代價。

以及失敗清單（唯一需要人讀的部分，且只列出錯的）：

```
候選 A 科目失敗：
  parking-01:  predicted 6114 運費   expected {6113 旅費, 613212 交通費用}
  fuel-01:     predicted 6114 運費   expected {6132 其他費用, 613206 燃料費}
```

它呈現錯誤的「模式」而非只有數字，直接餵給下面的一般性修正。

## Eval 如何幫你決策

1. **用比率取代軼事**：把爭論單張發票，換成「74% vs 92% 科目正確率」這種決策級數字。
2. **讓權衡顯式化**：正確率、延遲、成本並列，「多 0.6 秒換多少正確率」變成可衡量的選擇。常會看到曲線拐點，某設定更準又更快即可直接淘汰對手。
3. **設門檻**：科目建議要夠準，複核者才會信；低於某準確率反而讓人重查每一筆，AI 變成增加點擊而非節省。eval 告訴你哪些設定過關。
4. **回歸防護**：換模型或改 prompt 後重跑同一套，部署前即知任一欄位的正確率有無變動。
5. **餵養一般性修正**：失敗清單就是改進的輸入。錯誤若成群（例如各種交通類都被歸到運費），就知道該為哪些科目補用途註解、或挑哪些樣本進 few-shot，與 `classifier_hint` 回寫累積的是同一批標註資料。

## 設計這套 eval 時的幾個原則

這些是促成上述方法的觀察，供判斷該調哪個槓桿時參考，但不是 eval 的主體：

1. **thinking 不等於 OCR。** 讀出影像上的字（含手寫）是視覺編碼器在 forward pass 做的「感知」；thinking 是之後的「推理」。加再多 thinking 也不會讓模糊手寫變清楚。辨識準確度的真正槓桿是模型視覺能力與影像解析度，不是 thinking。

2. **正確性優先靠模型 capability，而非推理預算。** 科目判斷這類推理較重的欄位，與其在弱模型上一直加 thinking（延遲翻倍仍未必對），不如換更強的模型，往往更準且幾乎不增延遲。eval 的決策表就是用來比較這兩條路。

3. **不要用 prompt 補丁逐案修。** 「X 不是 Y」這種規則是 whack-a-mole：只能修看過的錯，規則無上限地長，新增規則可能讓別的案例退步。會 scale 的是：提升模型 capability、一次性標註科目分類法（為易混淆科目群加用途說明）、用真實人工修正回灌 few-shot。

4. **科目是人工複核欄位，目標是降低錯誤率而非追求完美。** 員工每次改 AI 的猜測都是一筆標註，透過 `classifier_hint` 回寫累積，從實際錯誤分佈自我修正處理長尾。

## 待辦

- 建立標註樣本集（manifest + `expected`，科目用可接受集合）與 runner（自動評分與彙總）。
- 把目前的單一樣本觀察升級成整體錯誤率。
- 為易混淆科目群（如運費 vs 旅費／交通費用）加一行用途註解到送進模型的清單。
- 確認 `classifier_hint` 人工修正回寫持續累積，作為長尾與 few-shot 的資料來源。

---

## 附錄：案例（2026-06 Gemini 延遲調校）

促成這套 eval 的實際事件，保留作參考。

辨識單張約需 23 秒，根因是當時的 `gemini-2.5-flash` 預設開啟 thinking，輸出前先花大量推理 token。Gemini 3.x 以字串列舉 `thinkingConfig.thinkingLevel`（`minimal | low | medium | high`，預設 `medium`）取代舊的數值 `thinking_budget`。

用同一張「停車費」樣本逐一測試（同影像、同 prompt，只換設定）：

| 設定 | 延遲 | 停車費科目 | 結果 |
| --- | --- | --- | --- |
| 2.5-flash（舊，預設 thinking） | 23s | 6113 旅費 | 正確但慢 |
| 3.1-flash-lite + low | 2.3s | 6114 運費 | 誤判 |
| 3.1-flash-lite + medium | 4.2s | 6114 運費 | 誤判 |
| 3.1-flash-lite + high | 7s | 6113 旅費 | 正確但慢 |
| **3.5-flash + low** | **2.9s** | **6113 旅費** | **正確且快（採用）** |

最終採用 **`gemini-3.5-flash` + `thinkingLevel: "low"`**，設定集中在兩個常數（`supabase/functions/extraction-worker/index.ts` 的 worker 與 `lib/services/gemini.ts` 的 server action），改一行即可調整。worker 變更需 `supabase functions deploy extraction-worker` 後生效。

這次的教訓正是上面那些原則的來源：flash-lite 在 `low`／`medium` 都把停車費誤判為運費，要拉到 `high` 才對但延遲飆到 7 秒；換成 3.5-flash 在 `low` 即正確且僅 2.9 秒。但整個過程只有單一樣本（n=1），足以決定預設值，卻不足以代表整體錯誤率，這正是為什麼要建上面的 eval。
