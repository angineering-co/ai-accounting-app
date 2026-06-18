-- ECPay 收款退款（app 端發起）：在 ecpay_payments 上記錄退款結果。
--
-- 退款一律由本 app 透過綠界 CreditDetail/DoAction（Action=R）發起，成功後寫回此處。
-- 綠界商家後台「直接退款」不會回呼本系統（付款 ReturnURL 僅在原始付款時觸發一次），
-- 故退款請一律在 SnapBooks 內操作，不要直接進綠界後台退，否則本系統仍會顯示已付款。
--
-- v1 僅支援全額退款：refunded_amount 等於 amount。日後若要部分退款，refunded_amount
-- 可記實際退款金額，並視需要新增 'partially_refunded' 狀態（屆時再 ALTER，不預建）。

ALTER TABLE ecpay_payments
    DROP CONSTRAINT ecpay_payments_status_check,
    ADD CONSTRAINT ecpay_payments_status_check
        CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'refunded'));

ALTER TABLE ecpay_payments
    ADD COLUMN refunded_amount INTEGER NULL,      -- 已退款金額（v1 全額退款 = amount）
    ADD COLUMN refunded_at      TIMESTAMPTZ NULL; -- 退款成功時間
