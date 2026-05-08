# Perf plan: trim list payloads + add composite indexes

Status: **partially shipped — payload trim merged, indexes deferred**

## Decisions

- ✅ **Shipped**: list-query payload trim + dialog re-fetch (commits `0dea370`,
  `61f20fb`). Reduces 50-row page payload from ~150–400 KB to ~15–30 KB.
- ⏸ **Deferred**: composite indexes. Wait until query plans actually start to
  drag on real data. The trim alone removed the user-visible slowness; index
  cost is about scaling, not current pain. Pick this back up if/when the period
  page feels slow on a real client's busy month, or if the Supabase dashboard
  flags `invoices` / `allowances` reads as slow.
- ⏸ **Deferred**: status-counts collapse. PostgREST has no `GROUP BY` without
  RPC, and we'd rather wait for Drizzle (planned) to land and write native SQL
  in a server action. Without the composite index this is 5×2 parallel COUNTs
  per period open — fine in practice over HTTP/2; revisit if it shows up in
  slow-query logs.
- ⏸ **Deferred**: `getInvoices(firmId)` and the firm-level invoice page —
  needs pagination, not just a column trim.

## Why

The period-detail page and the firm-level invoice page were slow on first paint
and on navigation. Two compounding causes:

1. List queries `select("*")`, which pulls the full `extracted_data` JSONB on every
   row — the table only displays 4 fields from it.
2. The hottest filter (`tax_filing_period_id` + `status` ORDER BY `created_at DESC`)
   has no supporting composite index, so the planner falls back to a single-column
   scan + in-memory sort.

After moving Vercel from `iad1` to `sin1`, server-side latency dropped sharply, so
the remaining bottleneck was **payload size and round-trip count from the browser
to Singapore**. The shipped trim attacks payload directly. The composite index
(deferred below) would remove sort cost and turn `count: "exact"` and the status
fan-out into index-only scans — relevant once row counts grow.

## Deferred: migration for composite indexes

Not yet shipped. Keep this section as a copy-pasteable plan for when query plans
actually start to drag. Validate first via `EXPLAIN ANALYZE` on the slow query —
if the plan already shows "Index Scan ... ORDER BY ... LIMIT" without a Sort
node, the existing single-column indexes are sufficient and these composites
won't help.

When you do apply, drop into a fresh migration file
(`supabase/migrations/<timestamp>_perf_period_list_indexes.sql`):

```sql
-- Period-detail page (staff): filters tax_filing_period_id + status, orders created_at DESC.
-- Status-count fan-out (5 parallel COUNT queries) also uses (period_id, status).
CREATE INDEX IF NOT EXISTS idx_invoices_period_status_created
  ON invoices (tax_filing_period_id, status, created_at DESC);

-- Portal period page: filters tax_filing_period_id + in_or_out, orders created_at DESC.
CREATE INDEX IF NOT EXISTS idx_invoices_period_inout_created
  ON invoices (tax_filing_period_id, in_or_out, created_at DESC);

-- Allowances are always client-scoped (both staff and portal pass client_id).
CREATE INDEX IF NOT EXISTS idx_allowances_client_period_status_created
  ON allowances (client_id, tax_filing_period_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_allowances_client_period_inout_created
  ON allowances (client_id, tax_filing_period_id, in_or_out, created_at DESC);

-- Now-redundant indexes (leading columns are covered by the new composites).
-- Drop after the new indexes are confirmed in-use; safe to skip if you'd rather wait.
DROP INDEX IF EXISTS idx_invoices_tax_filing_period_id;
DROP INDEX IF EXISTS idx_allowances_client_period;
```

### Notes for the reviewer

- **`CREATE INDEX CONCURRENTLY`?** Supabase wraps migrations in a transaction, and
  `CONCURRENTLY` cannot run inside one. For tables under ~1M rows the regular
  `CREATE INDEX` brief lock is fine (we're well under that). If/when the tables
  grow, run the index build manually via the Supabase SQL editor with
  `CONCURRENTLY` and mark the migration applied.
- **What's intentionally kept**:
  - `idx_invoices_status` — single-column. Useful if any future query filters by
    status alone (e.g. "all stuck-in-processing across the firm"). Cheap to keep.
  - `idx_invoices_created_at` — supports firm-wide recent-activity views.
  - `idx_invoices_firm_id`, `idx_invoices_client_id`, `idx_invoices_year_month`
    — all serve queries outside the period-review hot path.
  - `idx_allowances_original_invoice_id` (partial) — used when opening invoice
    detail to list linked allowances.
- **What's not added (yet)**:
  - `(firm_id, created_at DESC)` for the firm-level invoice page. Out of scope for
    this PR — that page also needs to start paginating before an index helps. See
    follow-up #5 in the perf analysis.

### Validation

After applying the migration, on staging:

```sql
-- Should show "Index Scan using idx_invoices_period_status_created", no Sort node.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, in_or_out, filename, storage_path, created_at, invoice_serial_code
FROM invoices
WHERE tax_filing_period_id = '<real-period-id>'
  AND status = 'uploaded'
ORDER BY created_at DESC
LIMIT 50;

-- Should be an index-only count.
EXPLAIN (ANALYZE)
SELECT count(*) FROM invoices
WHERE tax_filing_period_id = '<real-period-id>' AND status = 'uploaded';
```

Acceptance: no `Sort` node in the EXPLAIN, "Index Scan" or "Index Only Scan" on the
new index, and the COUNT plan should not read from heap.

## Refactor: trim list-query columns

### Fields the tables actually read

**Invoice table** (`components/invoice-table.tsx`):
- Scalar: `id`, `status`, `in_or_out`, `filename`, `storage_path`,
  `invoice_serial_code`, `client_id` (joined to `clients.id, name`)
- From `extracted_data`: `invoiceType`, `totalSales`, `tax`, `date`

**Allowance table** (`components/allowance-table.tsx`):
- Scalar: `id`, `status`, `in_or_out`, `filename`, `storage_path`,
  `allowance_serial_code`, `client_id`
- From `extracted_data`: `allowanceType`, `amount`, `taxAmount`, `date`, `source`

The review dialogs consume the full `extracted_data`, so they need a separate
fetch path (see "Dialog re-fetch" below).

### Approach

PostgREST supports JSONB key projection via the column-arrow syntax in `select=`.
That lets us return only the JSONB keys we need without touching the schema:

```ts
.select(`
  id, status, in_or_out, filename, storage_path,
  invoice_serial_code, client_id, created_at, year_month,
  client:clients(id, name),
  extracted_data->invoiceType,
  extracted_data->totalSales,
  extracted_data->tax,
  extracted_data->date
`, { count: "exact" })
```

PostgREST returns each `extracted_data->key` as a top-level field (`invoiceType`,
`totalSales`, …) by default, or you can alias them. We'll alias to keep the
existing component code working without a rewrite:

```ts
.select(`
  ...,
  extracted_data->invoiceType, 
  extracted_data->totalSales, 
  extracted_data->tax, 
  extracted_data->date
`)
```

Then map in the hook:

```ts
items: (rows ?? []).map((row) => ({
  ...row,
  extracted_data: {
    invoiceType: row.invoiceType,
    totalSales: row.totalSales,
    tax: row.tax,
    date: row.date,
  },
})) as unknown as Invoice[]
```

This is mechanical and keeps the table component unchanged.

### Files to change

#### 1. `hooks/use-paginated-period-invoices.ts:35–60`

Replace the `select("*", ...)` with the projected select above. Keep the rest of
the query (filters, ordering, range, count) untouched. Reshape rows in the
returned `items`. Don't run Zod parse — same reasoning as the existing comment
at `:55–57`.

#### 2. `hooks/use-paginated-period-allowances.ts:37–63`

Same shape. Projected fields:
- Scalar: `id, status, in_or_out, filename, storage_path, allowance_serial_code, client_id, tax_filing_period_id, original_invoice_id, original_invoice_serial_code, created_at`
- JSONB: `extracted_data->allowanceType, extracted_data->amount, extracted_data->taxAmount, extracted_data->date, extracted_data->source`

#### 3. `app/firm/[firmId]/invoice/page.tsx:89–104`

Currently fetches all rows for the firm with no pagination — bigger problem,
but at minimum apply the same column trim. (Pagination is a separate PR.)

#### 4. Dialog re-fetch on open

`components/invoice-review-dialog.tsx` and `components/allowance-review-dialog.tsx`
currently consume the `invoice`/`allowance` prop directly to seed the form. After
the trim, that prop only carries 4 JSONB fields. Add a fetch on dialog open:

```ts
useEffect(() => {
  if (!isOpen || !invoice) return;
  let cancelled = false;
  (async () => {
    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice.id)
      .single();
    if (!cancelled && data) setFullInvoice(data as Invoice);
  })();
  return () => { cancelled = true; };
}, [isOpen, invoice?.id]);
```

Then seed the form from `fullInvoice ?? invoice`. The dialog already pays a
round-trip for the signed URL and linked allowances on open
(`invoice-review-dialog.tsx:494–516`); piggybacking the full-row fetch costs one
more parallel request, not a serial one.

### Estimated payload reduction

Rough numbers from a representative invoice with line items and AI confidence
data: `extracted_data` averages 3–8 KB compressed. The 4 fields we need are
~150 bytes total. Per row, that's ~95–98% reduction in the JSONB portion.

For a 50-row page:
- Before: ~150–400 KB JSON over the wire (mostly `extracted_data`)
- After: ~15–30 KB

At Taipei↔Singapore (~50 ms RTT, modest bandwidth cap on mobile), this should
move the page from "noticeable wait" to "feels instant" — particularly on the
portal where mobile clients are more common.

## Risks

1. **PostgREST JSONB projection edge cases**: `extracted_data->key` returns the
   key as a JSONB value; `->>` returns text. Numbers inside `extracted_data`
   (`totalSales`, `tax`, `amount`, `taxAmount`) are stored as JSON numbers, so
   `->` returns them as numeric JSON. The `formatAmount` helper accepts both
   number and stringified-number, but **verify on staging** with at least one
   invoice that has decimal values and one with null.
2. **RLS still applies to the JSONB projection** — no risk of leaking other
   tenants' data, but worth re-running existing RLS tests after the change.
3. **Status-counts hook is unchanged in this PR.** With the composite index it
   stays at 5 parallel COUNTs per table but each is now an index-only scan, so
   wall-clock latency is ~1 RTT. See "Future: status-counts collapse" below.
4. **`keepPreviousData: true` in SWR** means after deploy, users may briefly see
   the old shape from cache. SWR re-fetches on mount so this clears within one
   render cycle; not a real risk, just noting.
5. **Dialog re-fetch latency**: the review dialog gains one extra round-trip on
   open. With Vercel + DB co-located in Singapore and the dialog already firing
   two parallel requests, this is in noise — but if the reviewer's network is
   bad, the form may take ~50 ms longer to populate. Acceptable.

## Rollout

1. Land the migration and the hook/dialog refactor in one PR.
2. Verify `EXPLAIN ANALYZE` on staging shows the new indexes in use.
3. Spot-check 5–10 invoices with varied `extracted_data` shapes (paper, electronic,
   imported via Excel, with/without line items) — confirm the table renders
   identically and the review dialog populates correctly.
4. Deploy. Watch the Supabase dashboard for a drop in PostgREST p50/p95 on the
   `invoices` and `allowances` endpoints.
5. After 1–2 days of clean signal, drop the redundant indexes
   (`idx_invoices_tax_filing_period_id`, `idx_allowances_client_period`) in a
   follow-up migration.

## Future: status-counts collapse (after Drizzle lands)

Deferred — not in this PR. Captured here so the next person picking it up has
the full context.

Today `hooks/use-status-counts.ts:32–47` fires 5 parallel COUNTs per table (10
total per period open), and `period/[periodYYYMM]/page.tsx:144–190` adds 4 more
COUNTs for `unconfirmed-check` and `total-entity-count`. After this PR's index
ships these are all index-only scans running in parallel — fast enough.

When Drizzle is added to the project, collapse them in a server action:

```ts
// Server action — runs in Vercel sin1, ~5 ms hop to Supabase sin1
"use server";
export async function getPeriodStatusCounts(periodId: string, clientId: string) {
  const [invoiceCounts, allowanceCounts] = await Promise.all([
    db.select({ status: invoices.status, count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(eq(invoices.tax_filing_period_id, periodId))
      .groupBy(invoices.status),
    db.select({ status: allowances.status, count: sql<number>`count(*)::int` })
      .from(allowances)
      .where(and(
        eq(allowances.tax_filing_period_id, periodId),
        eq(allowances.client_id, clientId),
      ))
      .groupBy(allowances.status),
  ]);
  return { invoiceCounts, allowanceCounts };
}
```

Then derive the other two checks client-side from the same counts:

- `hasUnconfirmedDocuments = (invoiceCounts.all - invoiceCounts.confirmed) > 0
                          || (allowanceCounts.all - allowanceCounts.confirmed) > 0`
- `totalEntityCount = invoiceCounts.all + allowanceCounts.all`

Net effect: 14 round-trips → 4 on first paint (period, client, paginated
invoices, paginated allowances, with status counts as a single server-action
call running parallel to the lists).

**RLS note**: when the Drizzle connection bypasses RLS (typical with a service
role connection from server actions), the WHERE clauses above are the *only*
tenant scoping. The server action must validate the caller is authorized to see
this period before issuing the query. We'll establish the project's RLS-vs-app
scoping policy when Drizzle lands; until then, RPC-via-PostgREST would have been
the safer route, which is part of why we're punting rather than half-stepping.
