# ECPay 收款 — 階段式實作計畫

> **狀態**：設計定案，採「快速上線」排序，尚未進實作。
>
> 本文件記錄與綠界 ECPay 串接收款的設計決策與分階段交付計畫。**v1 聚焦「一次性收款連結」**（涵蓋簽約前訂金、訂閱期費、偶發加購），定期定額（recurring auto-charge）降為後續階段。金流走 AIO（全方位金流，CMV-SHA256）、客戶端付款。

## 背景與已定案決策

SnapBooks 對終端客戶（中小企業 / 個人戶）收訂金、訂閱費與偶發加購。技術棧為 Next.js（App Router）+ TypeScript + Supabase，部署在 Vercel（sin1）。經討論定案：

| 決策點 | 結論 | 理由 |
|---|---|---|
| 付款方 | 終端客戶（client）或簽約前的潛在客戶 | SnapBooks 自己即事務所，對外受眾是中小企業 / 個人戶 |
| **收費引擎（v1）** | **一律走「一次性收款連結」**（AIO 一次付清） | 一個機制涵蓋訂金 / 訂閱期費 / 加購；server 定金額、寄連結、return callback 記帳。最少程式碼即可開始收錢 |
| 定期定額 auto-charge | **降為後續階段**（見「後續階段」） | 它只是「省去每期寄連結」的自動化，複雜且僵硬；等月繳客戶量證明值得再做 |
| 串接協議 | AIO 一次付清（CMV-SHA256） | 只需一份 CheckMacValue，消費者導向綠界代管付款頁，伺服器不碰卡號 |
| 資料分層（v1） | 單一張 `ecpay_payments`（每筆獨立付款） | v1 無 recurring 合約，毋須 `subscriptions` 表與狀態機。ECPay 識別碼鎖在此表 |
| 電子發票 | 本版不自動開立 | 暫緩，日後再接 |

**刻意不採用 / 暫緩**：站內付 2.0（手刻 AES、雙 Domain、ThreeDURL，過度工程）；定期定額綁卡自動扣款（彈性最高但要自建排程 / 催繳，且金額不可原地改、變更須重簽，留作後續升級路徑）。

依 memory / 專案慣例：開 feature branch、不動 main；拆可讀的數個 commit、以 migration 起頭；migration 只寫 `.sql` 放進 `supabase/migrations/`，不自動 apply、不自動 regenerate types；資料存取走 Drizzle / server-side SQL，不用 PostgREST RPC。

---

## 兩個收款 primitive（核心取捨）

整套金流其實只有兩個機制，v1 只做第一個：

**Primitive #1 — 一次性收款連結（v1 MVP）**
Server 端決定金額、產生不可猜的 `checkout_token`、寄一條連結給客戶；客戶點開後我方 checkout 頁自動 POST 到綠界、刷卡，`return` callback 回來記帳。
- 一個機制涵蓋三種收款：**訂金**（簽約前）、**訂閱期費**（月繳 / 年繳，每期寄一條）、**加購**。
- 連結不需登入即可運作，因此**同時解決「簽約前先付訂金、之後再開帳號」**的需求。
- 約佔整套程式碼的少數，卻涵蓋絕大多數業務價值。

**Primitive #2 — 定期定額 recurring（後續階段）**
客戶在簽約表單上輸入一次卡號（表單帶 `Period*` 參數），之後綠界依排程自動扣款、每期回 `PeriodReturnURL`，我方完全不必再寄連結。
- 好處：月繳客戶不必每月手動付款。
- 代價：最大的工程量、最 ECPay-specific 的複雜度，且最僵硬（金額簽約後不可改，漲價 / 升降級 / 月年互轉都要「終止舊的 + 重簽 + 客戶重輸卡號」）。
- 留待月繳客戶量證明值得自動化時再做。

**對帳期費的實務影響（v1）**：
- **年繳客戶**：一年寄一條連結。完全可接受、可能永遠不需要 recurring。
- **月繳客戶**：每月寄一條連結。可手動，亦可用一支 cron 每月自動寄出連結（仍是客戶自己點開付款，不是自動扣款，但工程量遠小於定期定額）。
- 定期定額就是把月繳這件事從「自動寄連結、客戶點付」升級為「完全自動扣款」。

---

## 金流機制（v1：一次付清）

v1 只用 AIO 一次付清（`ChoosePayment=Credit`，**不帶** `Period*` 參數），透過收款連結（下稱 Option B）收取。

AIO 不是前端直接呼叫的 API，而是「伺服器產生一張帶 CheckMacValue 的隱藏表單，瀏覽器自動 POST 到綠界付款頁」。消費者在綠界頁面刷卡，結果以 server-to-server 背景通知（ReturnURL）回到我方 callback，這是**權威來源**；另有前景導回的 OrderResultURL 只供顯示，不可當記帳依據。

### 定價與扣款結構

月費率以 **`lib/pricing.ts`** 的 `PRICES` 為單一真實來源（`annual: 1260`、`monthly: 1470`，皆為每月價），年度總額與 5 月加收由它推導。兩種方案都提供「一年 13 個月」的服務，差別在月費率與收法：年繳月費較低（1,260）、一次收清；月繳月費較高（1,470）、逐月收。v1 全部透過一次性連結收取。

| 方案 | 月費率（`PRICES`） | 一年實收 | v1 收法 |
|---|---|---|---|
| 年繳 | 1,260 | **16,380**（13×1,260，一次收清，含第 13 月） | 簽約時寄一條 16,380 的連結 |
| 月繳 | 1,470 | 17,640（12×1,470）+ 5 月加收 1,470 = **19,110** | 每月寄一條 1,470 的連結；每年 5 月另寄一條 1,470 |

**第 13 個月對齊 5 月**：第 13 個月對齊每年 **5 月**，營利事業所得稅申報季、事務所工作量最重的月份。年繳已在簽約時把 13 個月一次收清；月繳逐月收 12 期、第 13 個月（同月費率 1,470）在 5 月另收一筆。v1 它只是「5 月時多寄一條連結」，與其他月份的期費連結同一機制，不需要任何特殊處理。日後若把月繳期費自動化（cron 寄連結，或 recurring），5 月加收可一併由排程處理。

---

## 資料模型（v1）

單一張 `ecpay_payments`：每筆獨立付款（訂金 / 訂閱期費 / 加購），涵蓋一次性連結的完整生命週期。v1 無 recurring 合約，**不需要** `subscriptions` 表、狀態機與雙路徑冪等邏輯（那些隨 Primitive #2 一起回來，見「後續階段」）。

```sql
create table ecpay_payments (
  id                uuid primary key default gen_random_uuid(),

  firm_id           uuid not null references firms(id),     -- 快速篩選 / RLS 邊界
  client_id         uuid references clients(id),            -- nullable：簽約前訂金尚無 client

  type              text not null
    check (type in ('deposit', 'subscription', 'addon')),   -- 全為一次性；無 recurring 值
  status            text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired')),
  amount            integer not null,                       -- server 端決定，絕不信前端
  description       text not null,                          -- 顯示品項 / 期間，例 "2026 年度訂閱"、"6 月月費"

  -- 收款連結
  checkout_token    text not null unique,                   -- 公開把手，隨機不可猜，進 URL ?txn=
  expires_at        timestamptz,                            -- 連結過期時間

  -- 綠界比對 / callback 回填
  merchant_trade_no text unique,                            -- 建 row 時即產生（與 checkout_token 同時）；callback 以此比對 UPDATE。僅重試確定失敗的付款時才換新
  gwsr              bigint,                                 -- 授權交易號（綠界可達 10 位數，bigint 防 int 溢位），pending 時 NULL；付款憑證 / 退款用
  card4no           text,                                   -- 末四碼，顯示用（"卡號末四碼 5678"）
  raw_payload       jsonb,                                  -- 完整 callback 留存（含 rtn_code / trade_no / card6no 等所有原始欄位）

  charged_at        timestamptz,                            -- 付款成功時間
  created_at        timestamptz not null default now()
);

create index on ecpay_payments (firm_id, status);
create index on ecpay_payments (client_id);
```

**欄位取捨原則**：callback 欄位只有落在**讀取路徑**（被篩選、顯示或 join）才獨立成欄；其餘（`rtn_code` / `trade_no` / `card6no` 及所有授權明細）一律留在 `raw_payload`，需要時以 `raw_payload->>'…'` 取出。

| 欄位 | 為何獨立成欄 |
|---|---|
| `firm_id` / `client_id` | 篩選 / RLS |
| `type` / `status` / `amount` / `description` | 付款歷史列出與顯示 |
| `checkout_token` | 收款連結的 URL lookup |
| `merchant_trade_no` | callback 比對鍵（`UPDATE … WHERE` 的錨點）+ unique 冪等防線 |
| `gwsr` | 付款憑證識別碼；退款時要交給綠界的值 |
| `card4no` | 收據 / 歷史顯示 |
| `charged_at` / `created_at` | 排序 / 過期 / 時間軸 |

### 三個 id 的分工（容易混淆）

| id | 用途 | 放哪 | 格式 |
|---|---|---|---|
| `ecpay_payments.id` | 內部主鍵 | 僅後端 / DB，**不進 URL** | uuid |
| `checkout_token` | 收款連結的公開把手 | URL 的 `?txn=` | 隨機不可猜（如 nanoid 32 字） |
| `merchant_trade_no` | 送綠界、callback 比對 | 建 row 時產生並存回；送 ECPay | ≤20 英數、唯一 |

### 冪等與寫入規則（v1：單一路徑）

v1 每筆付款都**先建好 `pending` row**（建立時就連同 `checkout_token` 一起產生 `merchant_trade_no`、`gwsr` 初始 NULL）。`return` callback 回來時以 `merchant_trade_no` 找到該 row 後 `UPDATE` 填入 `gwsr` / `status` / `card4no` / `charged_at`。

- 冪等防線：`UNIQUE (merchant_trade_no)`。綠界同一筆重送（最多 4 次）只會 UPDATE 同一 row，不會重複入帳。
- **`merchant_trade_no` 建 row 時產生、render 不重生**：`merchant_trade_no` 與 `checkout_token` 同時於建立 row 時產生；checkout 頁 render 只「讀取」它（render 唯一需要取當下值的是 `MerchantTradeDate`）。因 render 不再產生任何 id，重整 / 多分頁**不可能覆寫**，舊分頁付款回來的 callback 一定比對得到、不會掉單。唯一會改寫 `merchant_trade_no` 的時機是「前次付款確定失敗、要重試」時換一個新號（綠界不接受重複的 `merchant_trade_no`）；`checkout_token` 則永不換、確保已寄出的連結持續有效。
- v1 **沒有** `INSERT … ON CONFLICT (merchant_trade_no, gwsr)` 這條路徑（那是 recurring 每期沿用同一 `merchant_trade_no`、`gwsr` 每期不同才需要的，隨 Primitive #2 一起回來）。因此 callback 內**只有 UPDATE、沒有 INSERT**，先前「pending 的 `gwsr=NULL` 在 upsert 下插出孤兒第二筆」的風險在 v1 結構性不存在。

### RLS

- client 只能讀自己（`client_id` 相符）的 `ecpay_payments`；事務所員工讀該 `firm_id` 的全部。
- callback 寫入用 admin client（繞過 RLS），因為 callback 沒有登入 session。
- 簽約前訂金（`client_id` 為 NULL）由 `firm_id` 範圍 + 後台讀取，不開放公開讀。

---

## Callback 設計（v1）

v1 只需兩個 Route Handler（不是 Server Action）。Server Action 走 Next.js RSC 協定、有 CSRF / same-origin 保護，無法被綠界這種外部伺服器直接 POST、也無法回精確的純文字 `1|OK`。只有 Route Handler 能讀原始 body 並 `return new Response('1|OK', { status: 200 })`。

| Route | 觸發者 | 時機 | 性質 | 回 `1\|OK`？ |
|---|---|---|---|---|
| `app/api/ecpay/return/route.ts`（ReturnURL） | 綠界伺服器 | 付款結果 | server-to-server，**權威來源** | 要 |
| `app/api/ecpay/result/route.ts`（OrderResultURL） | 客戶瀏覽器 | 付款完導回前景 | 只為顯示 UI，**不可當依據** | 不用 |

核心原則：記帳只信 `return`（背景、會重送、要驗 CMV）；`result` 純粹給客戶看「付款成功」畫面，因為客戶可能付完就關掉瀏覽器，`result` 不一定會到，但 `return` 一定會到。

> `app/api/ecpay/period/route.ts`（PeriodReturnURL）是定期定額專屬，**v1 不實作**，見「後續階段」。

### 一次性收款連結流程（v1 核心流程）

涵蓋訂金 / 訂閱期費 / 加購，三者只是 `type` 與 `description` 不同。

**關鍵技術限制**：AIO 需要帶 CheckMacValue 的 POST，**不能用純 GET 連結直接付款**。所以連結指向「我方一頁 checkout」，該頁再自動 POST 表單到綠界。

```
1. 開一筆收款（後台 / 產生連結的小工具 / 簽約前訂金）
   → INSERT ecpay_payments
       id              = uuid（內部）
       firm_id, client_id（訂金可為 NULL）
       checkout_token    = 隨機不可猜字串（公開，進 URL）
       merchant_trade_no = ≤20 英數唯一（此時即產生，送綠界 / callback 比對用）
       type, description, amount        ← 金額 server 端決定
       status='pending', gwsr=NULL
       expires_at = now + N 天

2. 寄連結  /pay/<checkout_token>        （公開路由，email / LINE 寄出，像寄一張帳單）
   （已登入 client 的加購亦可用 portal 內的 checkout 連結，見「公開收款連結」）

3. 客戶點開 checkout 頁（server 端）
   → 用 checkout_token 查回該筆（檢查未過期、仍 pending）
   → 讀出該筆既有的 merchant_trade_no（建 row 時已產生，render 不重生）
   → 用「該筆的 amount + merchant_trade_no」組 AIO 一次付清表單 + CheckMacValue（MerchantTradeDate 取當下 UTC+8），自動送出

4. /api/ecpay/return 回來
   → 用 callback 的 MerchantTradeNo 找到這筆 → UPDATE 填入 status / gwsr / card4no / charged_at，寫帳
   → 回 "1|OK"（HTTP 200）

5. /api/ecpay/result（前景導回）→ 顯示「付款成功」頁，不做記帳、不回 1|OK
```

安全：金額永遠由 server 端依該 token 決定，絕不從 query 帶；`checkout_token` 隨機不可猜並設過期，避免列舉（IDOR）；`merchant_trade_no` 在 step 1 建 row 時即產生（render 只讀取、不重生），這樣 step 4 的 callback 一定比對得到、也不會被重整 / 多分頁覆寫。

### Callback 回應與比對規則

- 回**精確** `1|OK`：無引號、無小寫、無換行，HTTP status 必須 **200**。格式錯誤會觸發綠界重送最多 4 次。
- AIO callback 是 Form POST，`RtnCode` 以 form 欄位（字串）送達；用防禦性 `Number(rtnCode) === 1` 比較。
- CheckMacValue 驗證用 timing-safe 比較，**禁止** `==` / `===`。

---

## 公開收款連結（簽約前訂金，v1 核心）

> 這原本是「未來延伸」，現提前到 v1，因為它就是收訂金的唯一路徑，且與一次性連結同一套機制、幾乎零額外成本。

收款連結走**公開、僅憑 `checkout_token` 解析的路由** `app/pay/[token]/page.tsx`，不需登入 session（token 即 bearer 憑證），故「尚未註冊帳號的潛在客戶」也能開連結付款。

- `proxy.ts` 需把 `/pay` 加入 publicRoutes（否則 auth middleware 會把未登入訪客導去 `/auth/login`）。
- `ecpay_payments.client_id` 設為 nullable，可容納尚無帳號的付款（訂金）。待對方註冊後再以 email 或認領流程把該筆款項連結到新帳號。
- 已登入 client 的加購可走同一 `/pay/[token]` 公開頁，或 portal 內的等效 checkout 連結，二擇一即可，毋須兩套。

> 純零工程的退路（Option A）：綠界廠商後台「收款工具」可手動建收款連結寄出，完全不寫程式。代價是付款結果不會自動進 `ecpay_payments`、對帳靠後台 / 對帳檔。本計畫採 Option B（自家 `/pay/[token]`）以保資料在系統內。

---

## 關鍵限制與雷區（對本 stack）

1. **`lib/supabase/proxy.ts` 必須放行 `/api/ecpay` 與 `/pay`**。auth middleware 會把未列為 public 的路由導去 `/auth/login`，否則綠界的 server-to-server POST 會吃到 302、callback 收不到；公開付款頁也會被擋。
2. **Vercel 上的 callback**：ReturnURL 僅支援 port 443、需 FQDN、不可放在會改來源 IP 或攔非瀏覽器請求的 CDN 後方。Route Handler 要確保是動態 function、不被邊緣快取。上線前用測試帳號實打一筆，確認 Vercel 收得到綠界 POST。
3. **回應格式**：return 回**精確** `1|OK` + HTTP 200。
4. **冪等（v1 單一路徑）**：付款前已建 `pending` row，callback 以 `merchant_trade_no` `UPDATE`。`UNIQUE (merchant_trade_no)` 防綠界重送重複入帳。callback 內無 INSERT。
5. **`MerchantTradeDate` 用 UTC+8**，格式 `yyyy/MM/dd HH:mm:ss`。Vercel 預設 UTC，要先轉台灣時間。
6. **`RtnCode` 型別**：AIO callback 為 Form POST，用 `Number(x) === 1` 防禦性比較。
7. **`ItemName` 消毒**：過濾綠界 WAF 攔截關鍵字（echo / curl / wget 等）、過濾 HTML 與控制字元；移除換行（`\n` / `\r`）與綠界不支援的特殊字元（會導致檢核失敗或 CheckMacValue 不符），確切禁用字元集在 Phase 3 以 `2858.md`（AIO 介接注意事項）確認後落地；超過 400 字截斷（避免多位元組截斷導致 CheckMacValue 不符掉單）。
8. **`MerchantTradeNo`** 限英數、≤20 字、唯一。
9. **`HashKey` / `HashIV` 只放環境變數**，沿用現有 `.env.local` 慣例，新增 `ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` / `ECPAY_ENV`。絕不進前端或版本控制。
10. **CheckMacValue 用 SHA256 + `ecpayUrlEncode`**（先 urlencode、轉小寫、.NET 字元替換），不可與 AES 服務的 `aesUrlEncode` 混用。
11. **金額永遠 server 端決定**，依 `checkout_token` 查回，絕不從 query string 帶入。

---

## 分階段交付（v1）

每階段大致對應一個 commit / PR，以 migration 起頭。

### Phase 0 — 前置與常數
- 環境變數骨架：`ECPAY_MERCHANT_ID` / `ECPAY_HASH_KEY` / `ECPAY_HASH_IV` / `ECPAY_ENV`。測試用 AIO 公開帳號 `3002607`。
- 定價沿用既有的 **`lib/pricing.ts`**（`PRICES.annual = 1260`、`PRICES.monthly = 1470`，server 端權威金額來源），由連結產生工具讀取；ECPay 需要的衍生值在此檔加常數即可：年繳總額 16,380（13×1,260，一次收清）、月繳每期 1,470、5 月加收 1,470。`lib/pricing.ts` 內已有的 `REGISTRATION_PRICING_NOTE`（商行 6,500 / 有限公司 8,500 / 股份有限公司 9,500）本身就是一次性收款，天然適用同一收款連結（見「待拍板」是否獨立 `registration` type）。加購品項與金額**待使用者提供**。**不含** `Period*` 等定期定額參數（隨 Primitive #2 才需要）。

### Phase 1 — 資料層（migration）
- 新增單一張 `ecpay_payments` 表與 RLS（含 `firm_id` 索引）。
- 只寫 `.sql` 放進 `supabase/migrations/`，不自動 apply、不 regenerate types。

### Phase 2 — CheckMacValue 核心模組
- `lib/services/ecpay/checkmacvalue.ts`：`ecpayUrlEncode` + SHA256 產生 + timing-safe 驗證。純函式。
- 用 skill 的 `test-vectors/checkmacvalue.json` 寫 colocated 單元測試，確保與綠界一致。

### Phase 3 — AIO 一次付清 + checkout 頁
- `lib/services/ecpay/aio.ts`：一次付清表單組裝（不帶 `Period*`）。
- `MerchantTradeDate` UTC+8（render 當下產生）、`ItemName` 消毒。`MerchantTradeNo` 產生規則（≤20 英數唯一）在建 row 時套用，見 Phase 5。
- `app/pay/[token]/page.tsx`：公開路由，用 `checkout_token` 查回該筆、讀出既有 `merchant_trade_no`（不重生）、server render 自動送出表單。
- `proxy.ts` 放行 `/pay`。

### Phase 4 — Callback 端點
- `app/api/ecpay/return/route.ts`、`result/route.ts`。
- `proxy.ts` 放行 `/api/ecpay`。
- `return`：驗 CMV → 以 `merchant_trade_no` `UPDATE` 該 pending row（status / gwsr / card4no / charged_at、寫 `raw_payload`）→ 回 `1|OK`（HTTP 200）。
- `result`：顯示「付款成功」頁，不記帳、不回 `1|OK`。

### Phase 5 — 產生收款連結工具 + 付款歷史
- 一個「產生收款連結」的小工具（先可純內部 / 手動）：選 client（或留空＝訂金）、`type`、金額、品項 → 建 pending row（同時產生 `checkout_token` 與 `merchant_trade_no`，≤20 英數唯一）→ 產出可寄出的 `/pay/<token>` 連結。
- 付款歷史檢視（單一 query 撈 `ecpay_payments`，依 `firm_id` / `client_id` 篩選）。

### Phase 6 — 測試與上線
- 測試帳號跑全流程：建連結、付款、return callback 記帳、過期 / 失敗。
- 本機收 callback 用 ngrok（guides/24），因 callback 只吃 port 443、localhost 收不到。
- 上線 checklist（guides/16）：切正式帳號、URL 換 prod domain、環境變數、Vercel 上實打確認收得到 callback。

---

## 後續階段（暫不實作，升級路徑）

以下全部依賴或優化 v1，留待業務量證明需要時再做。**Primitive #1 的 CheckMacValue 模組與 `return` callback 100% 重用**，故這些不是重工、只是接續。

### A. 月繳期費自動寄連結（cron）
v1 月繳每月手動寄連結。第一步自動化：一支 Vercel Cron 每月掃 active 月繳客戶、各建一筆 pending `subscription` row + `checkout_token`、自動寄出連結。仍是客戶點開付款（非自動扣款），工程量遠小於定期定額。5 月加收 1,470 一併由此排程處理。

### B. 定期定額 recurring（Primitive #2）
真正的自動扣款。客戶簽約時在帶 `Period*` 的表單輸入一次卡號，綠界依排程自動續扣、每期回 `PeriodReturnURL`。
- 需新增 `app/api/ecpay/period/route.ts`（PeriodReturnURL，server-to-server 權威來源，回 `1|OK`）。
- 定期定額**首期**結果送 `return` 或 `period`（官方文件不夠明確），動工前用測試帳號實打確認。
- `total_success_times` 維護：首期 `return` 直接設 1（`return` 不帶 `TotalSuccessTimes`）；後續每期以 `period` 回傳的 `TotalSuccessTimes` **SET**（非自增）。
- 冪等需新增第二條路徑：cycle 每期沿用同一 `merchant_trade_no`、`gwsr` 每期不同，用 `INSERT … ON CONFLICT (merchant_trade_no, gwsr) DO NOTHING`。屆時 `ecpay_payments` 加回 `(merchant_trade_no, gwsr)` 複合唯一索引。
- 定期定額硬限制（`2868.md`）：`PeriodAmount` 簽約後**不可改**，漲價 / 月年互轉 / 升降級唯一做法是「終止舊的 + 重簽」（客戶需重輸卡號）；`ExecTimes` 月上限 999、年上限 99，擬直接設上限當近乎無限期；連續授權失敗 6 次綠界自動終止；不可與紅利折抵、分期並用。

### C. `subscriptions` 表（processor-agnostic）
recurring 落地時才新增，記訂閱合約狀態（plan / status / next_charge_at / total_success_times），不放任何 ECPay 欄位以利日後換 / 加金流商。設計方向先保留於紙上，v1 不建。

### D. 變更 / 取消訂閱（CreditCardPeriodAction，`2900.md`）
端點 `POST /Cashier/CreditCardPeriodAction`。`Action` 僅 `Cancel`（終止後續扣款，不可逆）與 `ReAuth`（補授權最近一次失敗）。金額無法經此 API 修改。月年互轉 / 漲價 / 升降級 = 先 `Cancel` + 重簽。由登入後的 Server Action 觸發。

### E. Portal 帳務頁
`.../portal/billing/page.tsx`：目前方案、狀態、下次扣款日、付款歷史、訂閱 / 取消按鈕。v1 的付款歷史（Phase 5）已是其雛形。

### F. 5 月加收的排程化與「年中新加入月繳客戶」政策
自動化（A 或 B）後，5 月加收由排程觸發，冪等可用 `surcharge_year` + partial unique index `(client_or_subscription, surcharge_year)`。並需拍板：5 月前才新加入的月繳客戶，當年是否照收滿額 / 跳過 / 比例計算。

### G. 電子發票自動開立
暫緩，日後再接。

---

## 待拍板 / 開放問題

1. **加購 / 訂閱品項與金額**：定價沿用 `lib/pricing.ts`（年繳 16,380 一次收清；月繳 1,470×12 + 5 月加收 1,470 = 19,110），剩**加購品項與各自金額**待提供。
2. **是否獨立 `registration` 付款類型**：`lib/pricing.ts` 已有商行 / 有限公司 / 股份有限公司的設立登記費，屬一次性收款，可走同一收款連結。`ecpay_payments.type` 是用既有的 `deposit` 涵蓋，還是新增 `registration`？
3. **收款連結有效期 `expires_at`**：訂金 / 加購連結幾天過期？
4. **簽約前訂金的認領流程**：客戶註冊後，如何把 `client_id=NULL` 的訂金 row 連結到新帳號（email 比對？人工認領？）。v1 可先人工，但要定一個做法。
5. **月繳期費何時自動化**：v1 手動寄連結可撐到多少客戶量？跨過門檻先做「cron 自動寄連結」（後續 A）還是直接上定期定額（後續 B）？
6. **退款政策**：v1 不做退款 API，靠廠商後台人工處理（憑 `gwsr` / `trade_no`），是否可接受？
7. **失敗 / 逾期處理**：一次性連結沒在期限內付款，是否寄提醒？逾期是否停用 / 降級？提醒幾次？

---

## 參考來源（綠界官方，`developers.ecpay.com.tw`）

v1 必讀：
- 信用卡一次付清：`2866.md`
- 付款結果通知（ReturnURL，單筆）：`2878.md`
- 檢查碼機制說明：`2902.md`
- AIO 介接注意事項（首次串接必讀）：`2858.md`

後續階段（recurring）：
- 信用卡定期定額參數：`2868.md`
- 定期定額付款結果通知（PeriodReturnURL）：`5631.md`
- 信用卡定期定額訂單作業（CreditCardPeriodAction）：`2900.md`

skill guides：`guides/01`（AIO）、`guides/13`（CheckMacValue）、`guides/16`（上線檢查）、`guides/24`（本地開發收 callback）。

測試帳號（AIO，公開共用，禁用於正式）：MerchantID `3002607` / HashKey `pwFHCqoQZGmho4w6` / HashIV `EkRm7iFT261dpevs` / SHA256。3D 驗證碼測試環境固定 `1234`。
