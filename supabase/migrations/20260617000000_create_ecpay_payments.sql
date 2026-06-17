-- ECPay 收款（v1）：單一張 ecpay_payments，記每筆獨立的一次性收款連結付款。
-- 涵蓋 type = deposit（簽約前訂金）/ subscription（訂閱期費，月繳或年繳）/ addon（加購）。
-- 定期定額（recurring auto-charge）為後續階段，屆時再加 subscriptions 表與
-- (merchant_trade_no, gwsr) 第二條冪等路徑；v1 不預建。
--
-- 冪等（v1 單一路徑）：付款前先建 pending row，checkout 頁 render 時才產生並寫回
-- merchant_trade_no；return callback 以 merchant_trade_no UPDATE 該 row（填 gwsr / status
-- / card4no / charged_at）。callback 內只有 UPDATE、無 INSERT，故不會插出孤兒 row。
-- 其餘綠界回傳欄位（rtn_code / trade_no / card6no 等）留在 raw_payload，需要時再取。

CREATE TABLE ecpay_payments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    firm_id           UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    -- client_id 可為 NULL：簽約前訂金尚無 client；ON DELETE SET NULL 以保留付款記錄
    client_id         UUID NULL REFERENCES clients(id) ON DELETE SET NULL,

    type              TEXT NOT NULL CHECK (type IN ('deposit', 'subscription', 'addon')),
    status            TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
    amount            INTEGER NOT NULL,        -- server 端決定，絕不信前端
    description       TEXT NOT NULL,           -- 顯示品項 / 期間，例 "2026 年度訂閱"、"6 月月費"

    -- 收款連結
    checkout_token    TEXT NOT NULL UNIQUE,    -- 公開把手，隨機不可猜，進 URL ?txn=
    expires_at        TIMESTAMPTZ NULL,        -- 連結過期時間

    -- 綠界比對 / callback 回填
    merchant_trade_no TEXT UNIQUE,             -- checkout render 時產生並存回；callback 以此比對 UPDATE（≤20 英數）
    gwsr              INTEGER NULL,            -- 授權交易號，pending 時 NULL；付款憑證 / 退款用
    card4no           TEXT NULL,               -- 末四碼，顯示用（"卡號末四碼 5678"）
    raw_payload       JSONB NULL,              -- 完整 callback 留存（含 rtn_code / trade_no / card6no 等）

    charged_at        TIMESTAMPTZ NULL,        -- 付款成功時間
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ecpay_payments_firm_id_status_idx ON ecpay_payments(firm_id, status);
CREATE INDEX ecpay_payments_client_id_idx ON ecpay_payments(client_id) WHERE client_id IS NOT NULL;

ALTER TABLE ecpay_payments ENABLE ROW LEVEL SECURITY;

-- 事務所員工（profile.client_id 為 NULL）讀寫該 firm 全部付款（含 client_id 為 NULL 的訂金）；
-- portal client（profile.client_id 有值）只見自己的付款（client_id NULL 的訂金對其不可見，
-- 因 NULL = client_id 為 NULL，不成立）。super_admin 一律放行。
-- 注意：callback 與連結產生走 admin / Drizzle（service role，繞過 RLS），此政策只保護 PostgREST 讀取路徑。
CREATE POLICY "Users can manage ecpay_payments in their firm" ON ecpay_payments
    FOR ALL
    USING (
        (
            firm_id = public.get_auth_user_firm_id()
            AND (
                public.get_auth_user_client_id() IS NULL
                OR client_id = public.get_auth_user_client_id()
            )
        )
        OR (auth.jwt() ->> 'role' = 'super_admin')
    )
    WITH CHECK (
        (
            firm_id = public.get_auth_user_firm_id()
            AND (
                public.get_auth_user_client_id() IS NULL
                OR client_id = public.get_auth_user_client_id()
            )
        )
        OR (auth.jwt() ->> 'role' = 'super_admin')
    );

-- GRANT：本 repo 目前仍靠 config.toml 的 auto_expose_new_tables = true 自動授權，
-- 故此處與既有 migration 一致、不寫顯式 GRANT。待全域顯式 GRANT PR（#234，
-- 2026-10-30 前替換 deprecated flag）落地時，一併補上本表的 GRANT。
