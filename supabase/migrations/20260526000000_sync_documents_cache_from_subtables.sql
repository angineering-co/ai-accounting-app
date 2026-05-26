-- Forward-sync `documents.{amount, doc_date, ocr_status}` from
-- `invoices` / `allowances` (their CTI children).
--
-- Why this exists
--   Phase 5.5 starts every upload as a `documents` row with placeholder values
--   (`doc_date = today`, `amount = NULL`, `ocr_status = 'pending'`), then
--   inserts the child invoice / allowance row. Real values appear only after
--   OCR. With no sync, the cache stays stale forever; with a sync only in TS,
--   we'd have to chase every write path (server actions, the Deno
--   extraction-worker, future Phase 6b bulk import, future Drizzle raw SQL) and
--   keep them in lockstep. Doing it as a DB trigger covers all paths in one
--   place, in the same TX as the parent write.
--
-- Source of truth
--   For `doc_type IN ('invoice','allowance')`, the subtable `extracted_data`
--   is authoritative; documents.amount / doc_date / ocr_status are a
--   denormalized cache. For `doc_type='other'` (future Upload Classifier),
--   documents is authoritative (no subtable).
--
-- Cross-firm safety
--   SECURITY DEFINER bypasses RLS on `documents`, so the UPDATE explicitly
--   scopes to `documents.firm_id = NEW.firm_id`. If a child row's
--   `document_id` ever points at another firm's parent (e.g., service-role
--   write, future code bug, or a not-yet-tightened bulk-import path), the
--   trigger no-ops instead of corrupting the victim's cache.
--
-- Cross-reference
--   The mapping rules mirror `scripts/backfill-document-id.ts`:
--     - deriveOcrStatus(status)
--     - parseDocDate(extracted_data.date, …) — see note below on the fallback
--     - computeAmount(docType, extracted_data)
--   Type semantics: we require the JSONB value of amount/totalAmount/taxAmount
--   to actually be a JSON `number` (`jsonb_typeof = 'number'`). String-typed
--   numerics like `"10500"` are treated as NULL, matching backfill's
--   `typeof === 'number'` rule.
--   Fallback for malformed `extracted_data.date` is one known place the two
--   diverge: backfill writes a fresh `documents` row using
--   `subtable.created_at`; the trigger keeps the existing `documents.doc_date`
--   (because the row already exists). For the standard forward-write path
--   (`createInvoice` / `createAllowance` sets the placeholder to today and
--   the subtable's `created_at` defaults to today), both land on the same
--   date. Only an out-of-band manual UPDATE to `documents.doc_date` makes
--   them differ.
--   Bottom line: if you change a rule here, change it in
--   `scripts/backfill-document-id.ts` too (and vice versa).
--
-- Trigger scope
--   `AFTER INSERT OR UPDATE OF extracted_data, status` — limiting `OF` to
--   those two columns avoids firing during the Phase 6a backfill (which only
--   writes `document_id`) and similarly cheap side-channel updates
--   (`invoice_serial_code`, etc).

-- ── invoices: amount = extracted_data.totalAmount ──────────────────────────
CREATE OR REPLACE FUNCTION public.sync_document_cache_from_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id UUID := NEW.document_id;
  v_match  TEXT[];
  v_year   INT;
  v_month  INT;
  v_day    INT;
  v_parsed_date DATE;
  v_amount BIGINT;
  v_ocr_status TEXT;
BEGIN
  IF v_doc_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_ocr_status := CASE NEW.status
    WHEN 'processed' THEN 'done'
    WHEN 'confirmed' THEN 'done'
    WHEN 'failed'    THEN 'failed'
    ELSE 'pending'
  END;

  IF NEW.extracted_data IS NULL THEN
    UPDATE public.documents
       SET ocr_status = v_ocr_status,
           updated_at = NOW()
     WHERE id = v_doc_id
       AND firm_id = NEW.firm_id;
    RETURN NEW;
  END IF;

  -- doc_date: only overwrite if extracted_data.date is a valid YYYY/MM/DD.
  -- Regex first (cheap) so most rejects don't enter the EXCEPTION block;
  -- make_date raises on real out-of-range values (e.g., 2026/02/30) and we
  -- swallow it back to NULL.
  v_match := regexp_match(NEW.extracted_data->>'date',
                          '^(\d{4})/(\d{1,2})/(\d{1,2})$');
  IF v_match IS NOT NULL THEN
    v_year  := v_match[1]::int;
    v_month := v_match[2]::int;
    v_day   := v_match[3]::int;
    IF v_month BETWEEN 1 AND 12 AND v_day BETWEEN 1 AND 31 THEN
      BEGIN
        v_parsed_date := make_date(v_year, v_month, v_day);
      EXCEPTION WHEN OTHERS THEN
        v_parsed_date := NULL;
      END;
    END IF;
  END IF;

  -- amount: require JSON `number` type (string-typed "10500" → NULL, matches
  -- backfill's `typeof === 'number'`). Wrap the BIGINT cast so a numeric
  -- overflow (adversarial input) degrades to NULL instead of aborting the
  -- parent UPDATE.
  IF jsonb_typeof(NEW.extracted_data->'totalAmount') = 'number' THEN
    BEGIN
      v_amount := round((NEW.extracted_data->>'totalAmount')::numeric)::BIGINT;
    EXCEPTION WHEN OTHERS THEN
      v_amount := NULL;
    END;
  ELSE
    v_amount := NULL;
  END IF;

  -- doc_date uses COALESCE (column is NOT NULL → keep placeholder if unset);
  -- amount is overwritten unconditionally so clearing the field clears cache.
  UPDATE public.documents
     SET ocr_status = v_ocr_status,
         doc_date   = COALESCE(v_parsed_date, doc_date),
         amount     = v_amount,
         updated_at = NOW()
   WHERE id = v_doc_id
     AND firm_id = NEW.firm_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_documents_cache_from_invoices ON public.invoices;
CREATE TRIGGER sync_documents_cache_from_invoices
AFTER INSERT OR UPDATE OF extracted_data, status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.sync_document_cache_from_invoice();

-- ── allowances: amount = extracted_data.amount + extracted_data.taxAmount ──
CREATE OR REPLACE FUNCTION public.sync_document_cache_from_allowance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id UUID := NEW.document_id;
  v_match  TEXT[];
  v_year   INT;
  v_month  INT;
  v_day    INT;
  v_parsed_date DATE;
  v_net NUMERIC;
  v_tax NUMERIC;
  v_amount BIGINT;
  v_ocr_status TEXT;
BEGIN
  IF v_doc_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_ocr_status := CASE NEW.status
    WHEN 'processed' THEN 'done'
    WHEN 'confirmed' THEN 'done'
    WHEN 'failed'    THEN 'failed'
    ELSE 'pending'
  END;

  IF NEW.extracted_data IS NULL THEN
    UPDATE public.documents
       SET ocr_status = v_ocr_status,
           updated_at = NOW()
     WHERE id = v_doc_id
       AND firm_id = NEW.firm_id;
    RETURN NEW;
  END IF;

  v_match := regexp_match(NEW.extracted_data->>'date',
                          '^(\d{4})/(\d{1,2})/(\d{1,2})$');
  IF v_match IS NOT NULL THEN
    v_year  := v_match[1]::int;
    v_month := v_match[2]::int;
    v_day   := v_match[3]::int;
    IF v_month BETWEEN 1 AND 12 AND v_day BETWEEN 1 AND 31 THEN
      BEGIN
        v_parsed_date := make_date(v_year, v_month, v_day);
      EXCEPTION WHEN OTHERS THEN
        v_parsed_date := NULL;
      END;
    END IF;
  END IF;

  -- amount + taxAmount; either may be missing, both missing → NULL.
  -- JSON `number` type required (string-typed values → treated as missing).
  IF jsonb_typeof(NEW.extracted_data->'amount') = 'number' THEN
    v_net := (NEW.extracted_data->>'amount')::numeric;
  END IF;
  IF jsonb_typeof(NEW.extracted_data->'taxAmount') = 'number' THEN
    v_tax := (NEW.extracted_data->>'taxAmount')::numeric;
  END IF;

  IF v_net IS NULL AND v_tax IS NULL THEN
    v_amount := NULL;
  ELSE
    BEGIN
      v_amount := round(COALESCE(v_net, 0) + COALESCE(v_tax, 0))::BIGINT;
    EXCEPTION WHEN OTHERS THEN
      v_amount := NULL;
    END;
  END IF;

  UPDATE public.documents
     SET ocr_status = v_ocr_status,
         doc_date   = COALESCE(v_parsed_date, doc_date),
         amount     = v_amount,
         updated_at = NOW()
   WHERE id = v_doc_id
     AND firm_id = NEW.firm_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_documents_cache_from_allowances ON public.allowances;
CREATE TRIGGER sync_documents_cache_from_allowances
AFTER INSERT OR UPDATE OF extracted_data, status ON public.allowances
FOR EACH ROW EXECUTE FUNCTION public.sync_document_cache_from_allowance();
