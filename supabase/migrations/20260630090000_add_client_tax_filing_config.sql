-- 客戶層級的申報書（.TET_U）預設值，免去每次產表時重新選填。
-- 以 JSONB 收納，未來新增每客戶固定的申報欄位（申報方式、總繳代號等）免再加欄位。
-- 形狀：{ "declaration_type": "1" | "2", "county_city": "臺北市" ... }
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tax_filing_config JSONB;
