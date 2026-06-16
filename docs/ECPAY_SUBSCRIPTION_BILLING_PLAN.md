# ECPay 訂閱金流 — 階段式實作計畫

> **狀態**：設計定案（已納入 PR #230 review 回饋），尚未進實作。
>
> 本文件記錄與綠界 ECPay 串接「訂閱收費 + 偶發加購」的設計決策與分階段交付計畫。客戶端付款，金流走 AIO（全方位金流，CMV-SHA256）。

## 背景與已定案決策

SnapBooks 對終端客戶（中小企業 / 個人戶）收訂閱費，並偶爾向客戶收一筆加購費用。技術棧為 Next.js（App Router）+ TypeScript + Supabase，部署在 Vercel（sin1）。經討論定案：

| 決策點 | 結論 | 理由 |
|---|---|---|
| 付款方 | 終端客戶（client） | SnapBooks 自己即事務所，對外受眾是中小企業 / 個人戶；帳務介面放在 client portal |
| 收費引擎 | Hybrid：基本訂閱走 ECPay 定期定額；加購走單筆付款 | 定期定額由綠界排程扣款，省去自建 cron；加購偶發、變動金額，獨立單筆處理 |
| 加購收款方式 | 寄「收款連結」（Option B：重用訂閱的 checkout） | 偶發加購不值得蓋專屬 UI；重用既有 checkout + return callback 幾乎零成本，且資料留在系統內 |
| 定價模型 | `base=1,260`，兩種方案年度皆 16,380（13 個月）：年繳一次收 16,380；月繳 1,260×12 + 每年 5 月加收 1,260 | 見下方「定價與扣款結構」。5 月對齊營所稅申報季 |
| 串接協議 | 基本訂閱與加購一律走 AIO（CMV-SHA256） | 只需實作一份 CheckMacValue，消費者導向綠界代管付款頁，伺服器不碰卡號 |
| 資料分層 | `subscriptions`（processor-agnostic）+ `ecpay_transactions`（ECPay 專屬） | 領域表不放金流商欄位、日後可重用；ECPay 識別碼鎖在子表。不預建多金流商抽象（無第二家前不寫 speculative schema） |
| 電子發票 | 本版不自動開立 | 暫緩，日後再接 |

**刻意不採用的方案**：站內付 2.0（需手刻 AES、雙 Domain、ThreeDURL，對本需求過度工程）；綁卡 + 自排程背景扣款（彈性最高但要自建排程 / 催繳，本版用不到，留作日後升級路徑，見「已知限制」）。

依 memory / 專案慣例：開 feature branch、不動 main；拆可讀的數個 commit、以 migration 起頭；migration 只寫 `.sql` 放進 `supabase/migrations/`，不自動 apply、不自動 regenerate types；資料存取走 Drizzle / server-side SQL，不用 PostgREST RPC。

---

## 金流機制

兩條金流都走 AIO，差別只在帶不帶定期參數。

- **基本訂閱**：AIO `ChoosePayment=Credit` + 定期參數 `PeriodAmount` / `PeriodType`（`M` 月繳或 `Y` 年繳）/ `Frequency` / `ExecTimes` / `PeriodReturnURL`。綠界依排程自動續扣，每期回 `PeriodReturnURL`。
- **加購 / 第 13 個月**：AIO 信用卡一次付清（同一套參數組裝，不帶 `Period*`），透過收款連結（Option B）收取。

### 定價與扣款結構

兩種方案年度都收滿 13 個月。`base = 1,260`，故兩種方案年度皆為 **16,380**。

| 方案 | 定期定額設定 | 一年實收 | 第 13 個月 |
|---|---|---|---|
| 年繳 | `PeriodType=Y`、`Frequency=1`、`PeriodAmount = 16,380`（13×1,260）、`ExecTimes=99` | 16,380（一次扣清） | 已含在年繳金額內 |
| 月繳 | `PeriodType=M`、`Frequency=1`、`PeriodAmount = 1,260`、`ExecTimes=999` | 15,120（12×1,260）+ 5 月加收 1,260 | 每年 **5 月**寄一筆 1,260 收款連結 |

**月繳第 13 個月的觸發點（每年 5 月，需排程）**：第 13 個月對齊 **5 月**——營利事業所得稅申報季、事務所工作量最重的月份。每年 5 月初由排程（Vercel Cron，例如 `0 0 1 5 *`）掃描所有 `status='active'` 的月繳訂閱，各建一筆 `type='annual_surcharge'`、金額 1,260 的 `ecpay_transactions` + `checkout_token`，寄收款連結給客戶。

- **為何用 5 月排程而非掛 `period` callback**：月繳扣款日依各自簽約日分散在整個月，且申報截止在 5/31。5 月初的排程能讓所有客戶在同一時間、提早收到連結（保留整個 5 月繳款），不受各自扣款日或當月續扣是否成功影響。
- **觸發冪等**：同一訂閱、同一年度只能產生一筆 `annual_surcharge`，以 `surcharge_year` + partial unique index `(subscription_id, surcharge_year)` 強制；排程重跑或當月多次執行都安全。
- **誠實更正**：先前「月繳完全不需排程器」因 5 月對齊而不再成立——月繳第 13 月需要這支一年一次的排程。基本月費續扣仍由綠界自動跑、不需排程。
- 年繳的第 13 月已含在簽約時的 16,380 內、不另外在 5 月收（其 13 個月隨各自年繳週期，不對齊 5 月）。

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

兩張表：`subscriptions`（processor-agnostic 的訂閱合約狀態）+ `ecpay_transactions`（ECPay 專屬識別碼 + 統一交易帳本，涵蓋每期續扣、第 13 月與加購）。`subscriptions` 刻意不放任何 ECPay 欄位，日後換 / 加金流商可直接重用；所有 ECPay 識別碼（`merchant_trade_no` / `gwsr` / `trade_no` / 卡號）鎖在 `ecpay_transactions`。原本構想的 `subscription_charges` / `addon_purchases` / 獨立冪等日誌全部併入 `ecpay_transactions`，讓「給客戶看完整付款歷史」是一條 query。

> **為何不另立 `ecpay_subscriptions` 綁定表**：定期約定的 `merchant_trade_no` 每期沿用同一個，已存在於該訂閱的每筆 `subscription_cycle` row；`period_type` / `frequency` / `exec_times` 由 `plan` + `billing-plans.ts` 常數推導，不需儲存。故兩張表足夠，不必再切第三張。

```
subscriptions          (processor-agnostic，無任何 ECPay 欄位)
  id                uuid pk
  client_id         fk
  plan              'monthly' | 'annual'
  status            'pending' | 'active' | 'cancelled' | 'failed'
  amount            integer        每期金額（月繳 base、年繳 13×base）
  total_success_times integer      已成功扣款期數（中性計數，值來自 ECPay）
  next_charge_at    timestamptz
  started_at / cancelled_at

ecpay_transactions     (ECPay 專屬 + 交易帳本)
  id                uuid pk        內部主鍵，不進 URL
  subscription_id   fk nullable    subscription_cycle / annual_surcharge 才有
  client_id         fk nullable    一般為該 client；簽約前訂金（未來）可為 NULL
  type              'subscription_cycle' | 'annual_surcharge' | 'addon'
  checkout_token    text nullable  收款連結用的公開把手（隨機不可猜），用過 / 過期即失效
  merchant_trade_no text           送綠界、callback 比對用
  gwsr              integer nullable  綠界授權交易號（pending 時 NULL，callback 回填）
  trade_no          text           綠界交易號
  amount            integer        金額在 server 端決定，絕不信任前端
  card6no / card4no
  rtn_code / status
  description       text           品項名稱或第幾期
  charged_at        timestamptz
  expires_at        timestamptz nullable  加購連結過期時間
  surcharge_year    smallint nullable  僅 annual_surcharge：所屬年度（如 2027）
  raw_payload       jsonb          原始 callback 留存備查
  UNIQUE (merchant_trade_no, gwsr)              冪等鍵（僅服務 subscription_cycle）
  PARTIAL UNIQUE (subscription_id, surcharge_year) WHERE type='annual_surcharge'
                                                一訂閱一年僅一筆 5 月加收
```

取消 / 查詢訂閱要用的定期約定 `merchant_trade_no`，從該訂閱任一筆 `subscription_cycle` row 取得（ECPay 每期沿用同一個）。processor 耦合鎖在 `ecpay_transactions` 與服務層，領域表 `subscriptions` 不需知道自己是被 ECPay 扣款。

### 三個 id 的分工（容易混淆）

| id | 用途 | 放哪 | 格式 |
|---|---|---|---|
| `ecpay_transactions.id` | 內部主鍵 | 僅後端 / DB，**不進 URL** | uuid |
| `checkout_token` | 收款連結的公開把手 | URL 的 `?txn=` | 隨機不可猜（如 nanoid 32 字） |
| `merchant_trade_no` | 送綠界、callback 比對 | 送 ECPay + 存回該筆 | ≤20 英數、唯一 |

### 冪等與寫入規則（依交易類型分流）

Callback 寫回時依 `type` 分兩條路徑，**不可用單一 upsert**（pending row 的 `gwsr=NULL` 在 Postgres unique constraint 中視為相異，不會與回傳的 `gwsr` 衝突，硬 upsert 會插出第二筆、原 pending 永遠變孤兒）：

- **addon / annual_surcharge**（付款前已建好 `pending` row、`merchant_trade_no` 唯一、`gwsr` 初始 NULL）：以 `merchant_trade_no` 找到該 row 後 `UPDATE` 填入 `gwsr` / `status`。
- **subscription_cycle**（無預建 row、每期沿用同一 `merchant_trade_no`、`gwsr` 每期不同）：`INSERT ... ON CONFLICT (merchant_trade_no, gwsr) DO NOTHING`，靠 `(merchant_trade_no, gwsr)` 防綠界重送（最多 4 次）重複入帳。

唯一索引 `UNIQUE (merchant_trade_no, gwsr)` 保留，但只服務 subscription_cycle 這條路徑。

### RLS

- client 只能讀自己的 `subscriptions` / `ecpay_transactions`。
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
 2. Number(RtnCode)===1 ?                       2. INSERT ecpay_transactions
 3. subscriptions → active                         (type=subscription_cycle)
    且 total_success_times = 1                  3. SET subscriptions.total_success_times
 4. 記 ecpay_transactions                          = TotalSuccessTimes、next_charge_at
 5. 回 "1|OK"                                    4. 回 "1|OK"
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

### `total_success_times` 維護（首期與後續不同來源）

- **首期成功（`return`）**：`return` 不帶 `TotalSuccessTimes`（那是 `period` 專屬欄位），故首期開通時直接設 `total_success_times = 1`。
- **後續每期（`period`）**：以回傳的 `TotalSuccessTimes` **SET**（不是 increment）`subscriptions.total_success_times`。用 SET 而非自增，即使首期意外同時觸發 `return` 與 `period` 也不會重複計數。

---

## 加購收款連結流程（Option B）

偶發加購不蓋專屬 UI，改「寄連結收款」。重用訂閱要建的 checkout + return callback，加購只多一個「產生連結」的小動作。

**關鍵技術限制**：AIO 需要帶 CheckMacValue 的 POST，**不能用純 GET 連結直接付款**。所以連結指向「我方一頁 checkout」，該頁再自動 POST 表單到綠界。

```
1. 開一筆加購（內部後台或一個產生連結的小工具）
   → INSERT ecpay_transactions
       id              = uuid（內部）
       checkout_token  = 隨機不可猜字串（公開）
       client_id, item(description), amount   ← 金額 server 端決定
       type='addon', status='pending', gwsr=NULL
       expires_at = now + N 天

2. 寄連結  /firm/[firmId]/client/[clientId]/portal/billing/checkout?txn=<checkout_token>
   （email / LINE 寄給客戶，像寄一張帳單）

3. 客戶點開 checkout 頁（server 端）
   → 用 checkout_token 查回該筆（檢查未過期、仍 pending）
   → 產生 merchant_trade_no、寫回這筆
   → 用「該筆的 amount」組 AIO 一次付清表單 + CheckMacValue，自動送出

4. /api/ecpay/return 回來
   → 用 callback 的 MerchantTradeNo 找到這筆 → `UPDATE` 填入 status / gwsr，寫帳
      （addon / annual_surcharge 走 UPDATE，不走 ON CONFLICT，見「冪等與寫入規則」）
```

安全：金額永遠由 server 端依該 token 決定，絕不從 query 帶；`checkout_token` 隨機不可猜並設過期，避免列舉（IDOR）；`merchant_trade_no` 在 step 3 組表單時才產生並存回，這樣 step 4 的 callback 才比對得到。

> step 2 的 checkout 連結目前在受登入保護的 portal 路由下，僅供「已有帳號的 client」。簽約前（pre-signup）訂金的公開連結版本見下方「未來延伸」。

> 純零工程的退路（Option A）：綠界廠商後台「收款工具」可手動建收款連結寄出，完全不寫程式。代價是加購結果不會自動進 `ecpay_transactions`、對帳靠後台 / 對帳檔。本計畫採 Option B 以保資料在系統內。

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
4. **冪等（依交易類型分流）**：addon / annual_surcharge 以 `merchant_trade_no` `UPDATE` 既有 pending row；subscription_cycle 才用 `INSERT ON CONFLICT (merchant_trade_no, gwsr)`。不可一律 upsert（pending 的 `gwsr=NULL` 在 unique constraint 中視為相異，會插出孤兒第二筆）。詳見「資料模型 §冪等與寫入規則」。
5. **`MerchantTradeDate` 用 UTC+8**，格式 `yyyy/MM/dd HH:mm:ss`。Vercel 預設 UTC，要先轉台灣時間。
6. **`RtnCode` 型別**：AIO callback 為 Form POST，用 `Number(x) === 1` 防禦性比較。
7. **`ItemName` 消毒**：過濾綠界 WAF 攔截關鍵字（echo / curl / wget 等）、過濾 HTML 與控制字元；另**移除換行（`\n` / `\r`）與綠界不支援的特殊字元**（會導致綠界端檢核失敗或 CheckMacValue 不符），確切禁用字元集在 Phase 3 以 web_fetch `2858.md`（AIO 介接注意事項）確認後落地；超過 400 字截斷（避免多位元組截斷導致 CheckMacValue 不符掉單）。
8. **`MerchantTradeNo`** 限英數、≤20 字、唯一。
9. **`HashKey` / `HashIV` 只放環境變數**，沿用現有 `.env.local` 慣例，新增 `ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` / `ECPAY_ENV`。絕不進前端或版本控制。
10. **CheckMacValue 用 SHA256 + `ecpayUrlEncode`**（先 urlencode → 轉小寫 → .NET 字元替換），不可與 AES 服務的 `aesUrlEncode` 混用。

---

## 未來延伸（暫不實作）

### 簽約前（pre-signup）收款連結 / 訂金

目前 checkout 連結在 `.../portal/...` 之下、受登入保護，「尚未註冊帳號的潛在客戶」無法開連結付款。已知有客戶希望「先付訂金、之後再開帳號」。屆時做法：把收款連結改成**公開、僅憑 `checkout_token` 解析的路由**（如 `app/pay/[token]/page.tsx`，加入 `proxy.ts` publicRoutes），不需登入 session（token 即 bearer 憑證）。`ecpay_transactions.client_id` 已設計為 nullable，可容納尚無帳號的付款；待對方註冊後再以 email 或認領流程把該筆款項連結到新帳號。訂閱（定期定額）仍需帳號，僅一次性 / 訂金付款支援簽約前。

**本版只預留 schema（`client_id` nullable）與此設計方向，不實作公開路由與認領流程。**

---

## 分階段交付

每階段大致對應一個 commit / PR，以 migration 起頭。

### Phase 0 — 前置與帳號
- 環境變數骨架：`ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` / `ECPAY_ENV`。測試用 AIO 公開帳號 `3002607`。
- 方案 / 定價常數檔 `lib/domain/billing-plans.ts`：
  - `base = 1,260` → 月繳每期 1,260、年繳 16,380（13×1,260）、第 13 月 surcharge 1,260（每年 5 月）。
  - 其他加購品項清單與各自金額（**待使用者提供**）。

### Phase 1 — 資料層（migration）
- 新增 `subscriptions`（processor-agnostic）、`ecpay_transactions` 兩張表與 RLS。
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
- 各 callback：驗 CMV → 依交易類型分流寫入（addon / annual_surcharge 用 `merchant_trade_no` `UPDATE`；subscription_cycle 用 `INSERT ON CONFLICT (merchant_trade_no, gwsr)`）→ 回 `1|OK`（HTTP 200）。
- 開通邏輯：首期成功 → 訂閱 `active` 且 `total_success_times = 1`；每期成功 → INSERT charge、`SET total_success_times = TotalSuccessTimes` 與 `next_charge_at`；加購 / 第 13 月成功 → `UPDATE` 該筆。
- 第 13 個月**不**在 callback 處理，改由 5 月排程觸發（見 Phase 5a）。

### Phase 5 — Portal 帳務頁 + 取消 / 變更 + 加購連結
- `.../portal/billing/page.tsx`：目前方案、狀態、下次扣款日、付款歷史（單一 query 撈 `ecpay_transactions`）、訂閱 / 取消按鈕。
- `lib/services/ecpay/period-action.ts`：`CreditCardPeriodAction`（`Cancel` / `ReAuth`），由 Server Action 觸發。
- 月 / 年轉換 = 終止舊的 + 重新簽。
- 加購：一個「產生收款連結」的小工具（先可純內部 / 手動），建 pending 的 addon 筆 + `checkout_token`，產出可寄出的連結。

### Phase 5a — 第 13 個月排程（5 月）
- Vercel Cron（`0 0 1 5 *`，台灣時間 5/1）打一支受保護的內部路由 `app/api/cron/annual-surcharge/route.ts`（驗證 cron secret）。
- 路由邏輯：撈所有 `status='active'` 的月繳訂閱 → 對每筆建 `type='annual_surcharge'`、金額 1,260、`surcharge_year=當年` 的 `ecpay_transactions` + `checkout_token` → 寄收款連結。
- 冪等：靠 `PARTIAL UNIQUE (subscription_id, surcharge_year)`，重跑安全。
- 新加入客戶的處理依「待拍板」政策（是否對當年 5 月前新加入者收滿額 / 跳過 / 比例計算）。

### Phase 6 — 測試與上線
- 測試帳號跑全流程：訂閱、續扣、加購連結、取消。
- 本機收 callback 用 ngrok（guides/24），因 callback 只吃 port 443、localhost 收不到。
- 上線 checklist（guides/16）：切正式帳號、URL 換 prod domain、環境變數、Vercel 上實打確認收得到 callback。

---

## 待拍板 / 開放問題

1. ~~**定價數字**~~：已定 `base = 1,260`（年繳 16,380 一次；月繳 1,260×12 + 5 月加收 1,260）。剩**加購品項與各自金額**待提供。
2. **加購品項管理**：固定清單寫死在 `billing-plans.ts`，還是要可後台調整（延後）？
3. ~~**第 13 月綁時點**~~：已定**對齊 5 月**（營所稅申報季），由 5 月排程觸發。
4. **5 月加收對「年中新加入的月繳客戶」怎麼算**（新出現的子問題）：5 月前才剛加入的月繳客戶，5 月是否照收滿額 1,260、跳過當年、還是按已訂閱月數比例？影響 Phase 5a 排程的篩選條件。
5. **第 13 個月 / 5 月加收沒付怎麼辦**（月繳催繳）：寬限期多久（5/31 截止前後）？逾期是否停用 / 降級？提醒幾次？Option C 的主要風險點。
6. **ExecTimes**：是否同意直接設上限當「近乎無限期」、不另做到期重簽？
7. **測試環境如何驗證續扣**：綠界 stage 的定期定額後續週期如何觸發測試，Phase 3 前先 web_fetch 介接注意事項確認。
8. **退款政策**：本版不做退款 API，靠廠商後台人工處理，是否可接受？（信用卡可事後 DoAction 退某一期，但定期定額退款情境較細）
9. **失敗催繳**：定期定額連續 6 次失敗綠界自動取消。是否本版就加扣款失敗的 email 通知，還是延後？

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
