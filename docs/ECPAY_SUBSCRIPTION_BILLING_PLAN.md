# ECPay 訂閱金流 — 階段式實作計畫

> **狀態**：設計定案，尚未進實作。
>
> 本文件記錄與綠界 ECPay 串接「訂閱收費 + 偶發加購」的設計決策與分階段交付計畫。客戶端付款，金流走 AIO（全方位金流，CMV-SHA256）。

## 背景與已定案決策

SnapBooks 對終端客戶（中小企業 / 個人戶）收訂閱費，並偶爾向客戶收一筆加購費用。技術棧為 Next.js（App Router）+ TypeScript + Supabase，部署在 Vercel（sin1）。經討論定案：

| 決策點 | 結論 | 理由 |
|---|---|---|
| 付款方 | 終端客戶（client） | SnapBooks 自己即事務所，對外受眾是中小企業 / 個人戶；帳務介面放在 client portal |
| 收費引擎 | Hybrid：基本訂閱走 ECPay 定期定額；加購走單筆付款 | 定期定額由綠界排程扣款，省去自建 cron；加購偶發、變動金額，獨立單筆處理 |
| 加購收款方式 | 寄「收款連結」（Option B：重用訂閱的 checkout） | 偶發加購不值得蓋專屬 UI；重用既有 checkout + return callback 幾乎零成本，且資料留在系統內 |
| 定價模型 | 兩種方案年度皆收 13 個月：年繳一次收 13×月費；月繳 12 期收月費 + 每年第 13 個月寄收款連結 | 見下方「定價與扣款結構」。月繳第 13 月用 Option B 連結，金額乾淨透明 |
| 串接協議 | 基本訂閱與加購一律走 AIO（CMV-SHA256） | 只需實作一份 CheckMacValue，消費者導向綠界代管付款頁，伺服器不碰卡號 |
| 電子發票 | 本版不自動開立 | 暫緩，日後再接 |

**刻意不採用的方案**：站內付 2.0（需手刻 AES、雙 Domain、ThreeDURL，對本需求過度工程）；綁卡 + 自排程背景扣款（彈性最高但要自建排程 / 催繳，本版用不到，留作日後升級路徑，見「已知限制」）。

依 memory / 專案慣例：開 feature branch、不動 main；拆可讀的數個 commit、以 migration 起頭；migration 只寫 `.sql` 放進 `supabase/migrations/`，不自動 apply、不自動 regenerate types；資料存取走 Drizzle / server-side SQL，不用 PostgREST RPC。

---

## 金流機制

兩條金流都走 AIO，差別只在帶不帶定期參數。

- **基本訂閱**：AIO `ChoosePayment=Credit` + 定期參數 `PeriodAmount` / `PeriodType`（`M` 月繳或 `Y` 年繳）/ `Frequency` / `ExecTimes` / `PeriodReturnURL`。綠界依排程自動續扣，每期回 `PeriodReturnURL`。
- **加購 / 第 13 個月**：AIO 信用卡一次付清（同一套參數組裝，不帶 `Period*`），透過收款連結（Option B）收取。

### 定價與扣款結構

兩種方案年度都收滿 13 個月（`base` = 月費基準）。

| 方案 | 定期定額設定 | 一年實收 | 第 13 個月 |
|---|---|---|---|
| 年繳 | `PeriodType=Y`、`Frequency=1`、`PeriodAmount = 13 × base`、`ExecTimes=99` | 13 × base（一次扣清） | 已含在年繳金額內 |
| 月繳 | `PeriodType=M`、`Frequency=1`、`PeriodAmount = base`、`ExecTimes=999` | 12 × base + 1 × base | 每滿 12 期，寄一筆 `base` 的收款連結 |

**月繳第 13 個月的觸發點（不需另開 cron）**：第 13 個月的收款連結掛在每月的 `PeriodReturnURL` callback 上自動產生。當某期回傳的 `TotalSuccessTimes` 為 12 的倍數（12、24、36…）時，系統建一筆 `type='annual_surcharge'`、金額 `base` 的 `payment_transactions` + `checkout_token`，自動寄收款連結給客戶。

- 觸發冪等：同一訂閱、同一個年度週期只能產生一筆 `annual_surcharge`。產生前先檢查該 `subscription_id` 在這個 12 期週期是否已有 `annual_surcharge`，避免 callback 重送造成重複開單。
- 由此月繳完全不需要獨立排程器；唯一非自動的是「客戶要點連結付第 13 個月」，這也是下方「待拍板」的催繳議題所在。

AIO 不是前端直接呼叫的 API，而是「伺服器產生一張帶 CheckMacValue 的隱藏表單，瀏覽器自動 POST 到綠界付款頁」。消費者在綠界頁面刷卡，結果以 server-to-server 背景通知回到我方 callback。

### 定期定額的硬限制（來源 `2868.md`）

- `PeriodAmount` 在簽約時固定，**事後不可更改**。漲價 / 月轉年 / 升降級的唯一做法是「終止舊訂閱 + 重新簽一筆」。
- `PeriodType`：`D`（天）/ `M`（月）/ `Y`（年）。
- `Frequency`：`M` 時 1~12、`Y` 時僅能為 1。
- `ExecTimes`：最少 2 次；`M` 上限 999、`Y` 上限 99。本計畫直接設上限當作「近乎無限期」（月繳 999 期約 83 年、年繳 99 期 99 年），不另做到期重簽。
- 連續授權失敗 6 次，綠界自動終止後續扣款。
- 不可與紅利折抵、分期付款參數並用。

---

## 資料模型

兩張表：`subscriptions`（訂閱合約狀態）+ `payment_transactions`（統一交易帳本，涵蓋每期續扣與加購）。原本構想的 `subscription_charges` / `addon_purchases` / 獨立的冪等日誌全部併入 `payment_transactions`，讓「給客戶看完整付款歷史」是一條 query。

```
subscriptions
  id                uuid pk
  client_id         fk
  plan              'monthly' | 'annual'
  status            'pending' | 'active' | 'cancelled' | 'failed'
  merchant_trade_no            首期簽約送綠界的訂單編號（定期定額後續沿用同一個）
  period_amount     integer
  exec_times        integer
  total_success_times          integer  目前已成功扣款期數（來自 PeriodReturnURL）
  next_charge_at    timestamptz
  started_at / cancelled_at

payment_transactions            統一帳本
  id                uuid pk        內部主鍵，不進 URL
  client_id         fk
  type              'subscription_cycle' | 'annual_surcharge' | 'addon'
  subscription_id   fk nullable    subscription_cycle / annual_surcharge 才有
  checkout_token    text nullable  收款連結用的公開把手（隨機不可猜），用過 / 過期即失效
  merchant_trade_no text           送綠界、callback 比對用
  gwsr              integer        綠界授權交易號
  trade_no          text           綠界交易號
  amount            integer        金額在 server 端決定，絕不信任前端
  card6no / card4no
  rtn_code / status
  description       text           品項名稱或第幾期
  charged_at        timestamptz
  expires_at        timestamptz nullable  加購連結過期時間
  raw_payload       jsonb          原始 callback 留存備查
  UNIQUE (merchant_trade_no, gwsr)              冪等鍵
```

### 三個 id 的分工（容易混淆）

| id | 用途 | 放哪 | 格式 |
|---|---|---|---|
| `payment_transactions.id` | 內部主鍵 | 僅後端 / DB，**不進 URL** | uuid |
| `checkout_token` | 加購收款連結的公開把手 | URL 的 `?txn=` | 隨機不可猜（如 nanoid 32 字） |
| `merchant_trade_no` | 送綠界、callback 比對 | 送 ECPay + 存回該筆 | ≤20 英數、唯一 |

### 冪等鍵為何是 `(merchant_trade_no, gwsr)`

定期定額**每一期沿用同一個 `MerchantTradeNo`**，只有 `Gwsr` 每期不同；一次性加購則每筆一個新的 `MerchantTradeNo`。所以只用 `merchant_trade_no` 無法區分定期定額的不同期，必須加 `Gwsr`。這個 unique constraint 同時做到：區分每期、防綠界重送（最多 4 次）造成重複入帳，也吸收掉原本獨立的冪等日誌。

### RLS

- client 只能讀自己的 `subscriptions` / `payment_transactions`。
- callback 寫入用 admin client（繞過 RLS），因為 callback 沒有登入 session。

---

## Callback 設計

三個 Route Handler（不是 Server Action）。Server Action 走 Next.js RSC 協定、回傳序列化 payload、預設 CSRF / same-origin 保護，無法被綠界這種外部伺服器直接 POST、也無法回精確的純文字 `1|OK`。只有 Route Handler 能讀原始 body 並 `return new Response('1|OK', { status: 200 })`。Server Action 留給登入後由我方 UI 觸發的動作（例如取消訂閱）。

| Route | 觸發者 | 時機 | 性質 | 回 `1\|OK`？ |
|---|---|---|---|---|
| `app/api/ecpay/return/route.ts`（ReturnURL） | 綠界伺服器 | 首期 / 加購付款結果 | server-to-server，**權威來源** | 要 |
| `app/api/ecpay/period/route.ts`（PeriodReturnURL） | 綠界伺服器 | 每期續扣（無客戶在場） | server-to-server，**權威來源** | 要 |
| `app/api/ecpay/result/route.ts`（OrderResultURL） | 客戶瀏覽器 | 付款完導回前景 | 只為顯示 UI，**不可當依據** | 不用 |

核心原則：開通與記帳只信 `return` / `period`（背景、會重送、要驗 CMV）；`result` 純粹給客戶看「付款成功」畫面，因為客戶可能付完就關掉瀏覽器，`result` 不一定會到，但 `return` 一定會到。

### 訂閱簽約流程

```
客戶在 portal 按「訂閱月繳 / 年繳」
        │
        ▼
checkout 頁 (server 組參數 + CheckMacValue，render 自動送出表單)
        │  瀏覽器自動 POST
        ▼
綠界付款頁 (客戶輸入卡號、3D 驗證)
        │
        ├──── 背景 server-to-server ────────────────────┐
        ▼                                                ▼
POST /api/ecpay/return                       (每期) POST /api/ecpay/period
 首期授權結果                                  第 2 期起綠界依排程自動扣
 1. 驗 CheckMacValue                           1. 驗 CheckMacValue
 2. Number(RtnCode)===1 ?                       2. 記一筆 payment_transactions
 3. subscriptions → active                         (type=subscription_cycle)
 4. 記 payment_transactions                     3. 更新 subscriptions.total_success_times
 5. 回 "1|OK"                                       與 next_charge_at
        │                                       4. 回 "1|OK"
        │  前景導回瀏覽器
        ▼
POST /api/ecpay/result  ← 顯示「訂閱成功」頁，不做開通邏輯、不回 1|OK
```

> 待實打確認：定期定額**首期**結果究竟只送 `return`、或 `return` 與 `period` 都送，官方文件不夠明確。因冪等鍵為 `(merchant_trade_no, gwsr)`，即使兩邊都到、`Gwsr` 相同會被 upsert 去重，不會重複入帳。確切行為在 Phase 3 動工前用測試帳號實打確認。

### PeriodReturnURL 帶回的欄位（來源 `5631.md`）

Form POST（`application/x-www-form-urlencoded`）：`RtnCode`（1 = 成功）、`MerchantTradeNo`、`Gwsr`、`TradeNo`、`Amount`（當期金額）、`TotalSuccessTimes`（已成功期數）、`card6no` / `card4no`。回應純文字 `1|OK`。

### Callback 回應與比對規則

- 回**精確** `1|OK`：無引號、無小寫、無換行，HTTP status 必須 **200**。格式錯誤會觸發綠界重送最多 4 次。
- AIO callback 是 Form POST，`RtnCode` 以 form 欄位（字串）送達；用防禦性 `Number(rtnCode) === 1` 比較。
- CheckMacValue 驗證用 timing-safe 比較，**禁止** `==` / `===`。

---

## 加購收款連結流程（Option B）

偶發加購不蓋專屬 UI，改「寄連結收款」。重用訂閱要建的 checkout + return callback，加購只多一個「產生連結」的小動作。

**關鍵技術限制**：AIO 需要帶 CheckMacValue 的 POST，**不能用純 GET 連結直接付款**。所以連結指向「我方一頁 checkout」，該頁再自動 POST 表單到綠界。

```
1. 開一筆加購（內部後台或一個產生連結的小工具）
   → INSERT payment_transactions
       id              = uuid（內部）
       checkout_token  = 隨機不可猜字串（公開）
       client_id, item(description), amount   ← 金額 server 端決定
       type='addon', status='pending'
       expires_at = now + N 天

2. 寄連結  /firm/[firmId]/client/[clientId]/portal/billing/checkout?txn=<checkout_token>
   （email / LINE 寄給客戶，像寄一張帳單）

3. 客戶點開 checkout 頁（server 端）
   → 用 checkout_token 查回該筆（檢查未過期、仍 pending）
   → 產生 merchant_trade_no、寫回這筆
   → 用「該筆的 amount」組 AIO 一次付清表單 + CheckMacValue，自動送出

4. /api/ecpay/return 回來
   → 用 callback 的 MerchantTradeNo 找到這筆 → 更新 status / gwsr，寫帳
```

安全：金額永遠由 server 端依該 token 決定，絕不從 query 帶；`checkout_token` 隨機不可猜並設過期，避免列舉（IDOR）；`merchant_trade_no` 在 step 3 組表單時才產生並存回，這樣 step 4 的 callback 才比對得到。

> 純零工程的退路（Option A）：綠界廠商後台「收款工具」可手動建收款連結寄出，完全不寫程式。代價是加購結果不會自動進 `payment_transactions`、對帳靠後台 / 對帳檔。本計畫採 Option B 以保資料在系統內。

---

## 變更 / 取消訂閱（CreditCardPeriodAction）

來源 `2900.md`，端點 `POST /Cashier/CreditCardPeriodAction`（測試 `payment-stage`、正式 `payment`）。`Action` 只有兩種：

- `Cancel`：終止後續扣款，**不可逆**，要恢復須重新簽一筆。
- `ReAuth`：補授權最近一次失敗的交易。

金額無法透過此 API 修改（「其他定期定額變更作業請登入廠商後台」）。

由此推導的 UI 行為：

- **取消訂閱** → `Action=Cancel`。
- **月轉年 / 年轉月 / 漲價 / 升降級** → 先 `Cancel` 舊訂閱 + 重新簽一筆新的定期定額。

> **已知 UX 後果**：因定期定額金額不可原地改、且不留可重用 token，**每次變更方案都會要客戶重新輸入一次卡號**（新訂單是一次全新的 AIO checkout）。對「偶爾變更」可接受。若日後客戶變更 / 加購變頻繁，正解是改走站內付 2.0 綁卡（綁一次卡、之後後端任意金額扣款、永不重輸卡號），代價是自建排程與催繳。此為本計畫的升級路徑，非本版範圍。

---

## 關鍵限制與雷區（對本 stack）

1. **`lib/supabase/proxy.ts` 必須放行 `/api/ecpay`**。auth middleware 會把未列為 public 的路由導去 `/auth/login`，否則綠界的 server-to-server POST 會吃到 302、callback 收不到。
2. **Vercel 上的 callback**：ReturnURL / PeriodReturnURL 僅支援 port 443、需 FQDN、不可放在會改來源 IP 或攔非瀏覽器請求的 CDN 後方。Route Handler 要確保是動態 function、不被邊緣快取。上線前用測試帳號實打一筆，確認 Vercel 收得到綠界 POST。
3. **回應格式**：return / period 回**精確** `1|OK` + HTTP 200。
4. **冪等**：以 `(merchant_trade_no, gwsr)` upsert，避免重複開通 / 記帳。
5. **`MerchantTradeDate` 用 UTC+8**，格式 `yyyy/MM/dd HH:mm:ss`。Vercel 預設 UTC，要先轉台灣時間。
6. **`RtnCode` 型別**：AIO callback 為 Form POST，用 `Number(x) === 1` 防禦性比較。
7. **`ItemName` 消毒**：過濾綠界 WAF 攔截關鍵字（echo / curl / wget 等）、過濾 HTML 與控制字元；超過 400 字截斷（避免多位元組截斷導致 CheckMacValue 不符掉單）。
8. **`MerchantTradeNo`** 限英數、≤20 字、唯一。
9. **`HashKey` / `HashIV` 只放環境變數**，沿用現有 `.env.local` 慣例，新增 `ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` / `ECPAY_ENV`。絕不進前端或版本控制。
10. **CheckMacValue 用 SHA256 + `ecpayUrlEncode`**（先 urlencode → 轉小寫 → .NET 字元替換），不可與 AES 服務的 `aesUrlEncode` 混用。

---

## 分階段交付

每階段大致對應一個 commit / PR，以 migration 起頭。

### Phase 0 — 前置與帳號
- 環境變數骨架：`ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` / `ECPAY_ENV`。測試用 AIO 公開帳號 `3002607`。
- 方案 / 定價常數檔 `lib/domain/billing-plans.ts`：
  - `base`（月費基準）→ 月繳每期 `base`、年繳 `13 × base`、第 13 個月 surcharge `base`。
  - 其他加購品項清單與各自金額。
  - **`base` 數字與加購品項 / 金額待使用者提供**。

### Phase 1 — 資料層（migration）
- 新增 `subscriptions`、`payment_transactions` 兩張表與 RLS。
- 只寫 `.sql` 放進 `supabase/migrations/`，不自動 apply、不 regenerate types。

### Phase 2 — CheckMacValue 核心模組
- `lib/services/ecpay/checkmacvalue.ts`：`ecpayUrlEncode` + SHA256 產生 + timing-safe 驗證。純函式。
- 用 skill 的 `test-vectors/checkmacvalue.json` 寫 colocated 單元測試，確保與綠界一致。

### Phase 3 — AIO 訂單建立（表單產生）+ checkout 頁
- `lib/services/ecpay/aio.ts`：共用參數組裝 + 訂閱 builder（帶 `Period*`）+ 加購 builder（一次付清）。
- `MerchantTradeNo` 產生規則、`MerchantTradeDate` UTC+8、`ItemName` 消毒。
- `app/firm/[firmId]/client/[clientId]/portal/billing/checkout/page.tsx`：server render 自動送出表單；吃 `?txn=` 走加購、無 `txn` 走訂閱。
- 動工前用測試帳號實打一筆，確認定期定額首期是 `return` / `period` 何者送達。

### Phase 4 — Callback 端點
- `app/api/ecpay/return/route.ts`、`period/route.ts`、`result/route.ts`。
- `proxy.ts` 放行 `/api/ecpay`。
- 各 callback：驗 CMV → 以 `(merchant_trade_no, gwsr)` 冪等 upsert → 寫結果 → 回 `1|OK`（HTTP 200）。
- 開通邏輯：首期成功 → 訂閱 `active`；每期成功 → 記 charge、更新 `total_success_times` 與 `next_charge_at`；加購 / 第 13 月成功 → 更新該筆。
- **月繳第 13 個月自動觸發**：`period` callback 在記完當期後，若 `TotalSuccessTimes` 為 12 的倍數，且該訂閱本年度週期尚無 `annual_surcharge`，則建一筆 `annual_surcharge`（金額 `base`）+ `checkout_token`，並寄出收款連結。

### Phase 5 — Portal 帳務頁 + 取消 / 變更 + 加購連結
- `.../portal/billing/page.tsx`：目前方案、狀態、下次扣款日、付款歷史（單一 query 撈 `payment_transactions`）、訂閱 / 取消按鈕。
- `lib/services/ecpay/period-action.ts`：`CreditCardPeriodAction`（`Cancel` / `ReAuth`），由 Server Action 觸發。
- 月 / 年轉換 = 終止舊的 + 重新簽。
- 加購：一個「產生收款連結」的小工具（先可純內部 / 手動），建 pending 的 addon 筆 + `checkout_token`，產出可寄出的連結。

### Phase 6 — 測試與上線
- 測試帳號跑全流程：訂閱、續扣、加購連結、取消。
- 本機收 callback 用 ngrok（guides/24），因 callback 只吃 port 443、localhost 收不到。
- 上線 checklist（guides/16）：切正式帳號、URL 換 prod domain、環境變數、Vercel 上實打確認收得到 callback。

---

## 待拍板 / 開放問題

1. **定價數字**：`base`（月費基準）多少？加購品項與各自金額？（Phase 0 需要。定價結構已定：年繳 13×base、月繳 12×base + 第 13 月 base）
2. **加購品項管理**：固定清單寫死在 `billing-plans.ts`，還是要可後台調整（延後）？
3. **第 13 個月的收款連結，客戶沒付怎麼辦**（月繳專屬催繳）：寬限期多久？逾期是否停用 / 降級？提醒幾次？這是 Option C 的主要風險點，需要政策。
4. **第 13 個月連結是否要綁特定時點**：目前設計是「每滿 12 期自動觸發」（依簽約週期）。若希望對齊報稅 / 年度結算時點（例如固定某月），觸發邏輯要改成依日曆月而非滿 12 期。
5. **ExecTimes**：是否同意直接設上限當「近乎無限期」、不另做到期重簽？
6. **測試環境如何驗證續扣**：綠界 stage 的定期定額後續週期如何觸發測試，Phase 3 前先 web_fetch 介接注意事項確認。
7. **退款政策**：本版不做退款 API，靠廠商後台人工處理，是否可接受？（信用卡可事後 DoAction 退某一期，但定期定額退款情境較細）
8. **失敗催繳**：定期定額連續 6 次失敗綠界自動取消。是否本版就加扣款失敗的 email 通知，還是延後？

---

## 參考來源（綠界官方，`developers.ecpay.com.tw`）

- 信用卡定期定額參數：`2868.md`
- 信用卡一次付清：`2866.md`
- 付款結果通知（ReturnURL，單筆）：`2878.md`
- 定期定額付款結果通知（PeriodReturnURL）：`5631.md`
- 信用卡定期定額訂單作業（CreditCardPeriodAction）：`2900.md`
- 檢查碼機制說明：`2902.md`
- AIO 介接注意事項（首次串接必讀）：`2858.md`
- 直播主收款（Option C 參考，未採用）：`40999.md`

skill guides：`guides/01`（AIO）、`guides/13`（CheckMacValue）、`guides/16`（上線檢查）、`guides/24`（本地開發收 callback）。

測試帳號（AIO，公開共用，禁用於正式）：MerchantID `3002607` / HashKey `pwFHCqoQZGmho4w6` / HashIV `EkRm7iFT261dpevs` / SHA256。3D 驗證碼測試環境固定 `1234`。
