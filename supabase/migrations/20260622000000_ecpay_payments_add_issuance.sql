-- 收款的發票/收據開立追蹤（tracking metadata）。
--
-- 為何用 JSONB 而非獨立子表：這是低頻查詢的追蹤性資料，不需 FK/UNIQUE/報表聚合；
-- 一個欄位即可同時容納「發票或收據」以及未來的「折讓」陣列，避免日後逐項 ALTER。
-- 真正的法律憑證仍由 Amego 電子發票加值中心開立，本欄位只記錄「開了沒、開的是什麼」。
--
-- issuance JSON 形狀（null = 尚未處理，對已付款者即「待開立」）：
--   {
--     "kind":      "invoice" | "receipt" | "none",   -- 發票 / 收據 / 免開立
--     "order_id":  "SB7K3M9QH2",   -- 選填，寫在憑證上的連結碼（= 未來 Amego order_id）
--     "number":    "AB12345678",   -- 發票號碼（kind=invoice 必填）或收據編號（選填）
--     "issued_at": "2026-06-22T10:30:00+08:00",
--     "issued_by": "<profile uuid>",
--     "allowances": [              -- 未來折讓用，現階段不寫入
--       { "order_id": "...", "number": "...", "amount": 1234, "issued_at": "...", "issued_by": "..." }
--     ]
--   }
--
-- 寫入端把關：值由 lib/domain/models.ts 的 paymentIssuanceSchema (Zod) 於 server action 驗證。
-- 因內容為 JSON，DB 端不另設 CHECK；唯一性（order_id）亦不在 DB 強制（碰撞機率極低，
-- 且 Amego 端會拒絕重複 order_id）。

ALTER TABLE ecpay_payments
  ADD COLUMN issuance jsonb;

COMMENT ON COLUMN ecpay_payments.issuance IS
  '發票/收據開立追蹤 metadata（kind/order_id/number/issued_at/issued_by/allowances）；null=待處理。形狀見 paymentIssuanceSchema。';
