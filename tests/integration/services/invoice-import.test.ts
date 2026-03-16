import path from "path";
import { readFileSync } from "fs";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { processElectronicInvoiceFile, chunkedIn, chunkedUpsert } from "@/lib/services/invoice-import";
import {
  cleanupTestFixture,
  createTestFixture,
  getServiceClient,
  type TestFixture,
} from "@/tests/utils/supabase";

// ── Mock helpers ──────────────────────────────────────────────────────

/**
 * Creates a mock Supabase query builder that records each .in() call
 * and returns the requested values back as rows with { id: value }.
 */
function mockQueryBuilder(recordedChunks: string[][]) {
  const builder = () => ({
    select: () => ({
      in: (_col: string, values: string[]) => {
        recordedChunks.push([...values]);
        return {
          data: values.map(v => ({ id: v })),
          error: null,
        };
      },
    }),
  });
  return builder as unknown as Parameters<typeof chunkedIn>[0];
}

/**
 * Creates a mock that also supports extraFilters (chaining after .in()).
 */
function mockQueryBuilderWithFilters(
  recordedChunks: string[][],
  filterSpy: ReturnType<typeof vi.fn>,
) {
  const builder = () => ({
    select: () => ({
      in: (_col: string, values: string[]) => {
        recordedChunks.push([...values]);
        const terminal = {
          data: values.map(v => ({ id: v })),
          error: null,
          eq: (...args: unknown[]) => { filterSpy('eq', ...args); return terminal; },
          is: (...args: unknown[]) => { filterSpy('is', ...args); return terminal; },
          not: (...args: unknown[]) => { filterSpy('not', ...args); return terminal; },
        };
        return terminal;
      },
    }),
  });
  return builder as unknown as Parameters<typeof chunkedIn>[0];
}

/**
 * Creates a mock Supabase client for chunkedUpsert testing.
 */
function mockSupabaseClient(recordedChunks: Record<string, unknown>[][]) {
  return {
    from: () => ({
      upsert: (rows: Record<string, unknown>[]) => {
        recordedChunks.push([...rows]);
        return {
          select: () => ({
            data: rows.map((r, i) => ({ id: `id-${i}`, ...r })),
            error: null,
          }),
        };
      },
    }),
  } as unknown as Parameters<typeof chunkedUpsert>[0];
}

// ── Unit tests: chunking helpers ──────────────────────────────────────

describe('chunkedIn', () => {
  it('returns empty array for empty values', async () => {
    const chunks: string[][] = [];
    const result = await chunkedIn(
      mockQueryBuilder(chunks), 'id', 'code', [], undefined, 2,
    );
    expect(result).toEqual([]);
    expect(chunks).toHaveLength(0);
  });

  it('sends a single query when values fit in one chunk', async () => {
    const chunks: string[][] = [];
    const result = await chunkedIn<{ id: string }>(
      mockQueryBuilder(chunks), 'id', 'code', ['a', 'b'], undefined, 3,
    );
    expect(chunks).toEqual([['a', 'b']]);
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('splits values into correct chunks and merges results', async () => {
    const chunks: string[][] = [];
    const values = ['a', 'b', 'c', 'd', 'e'];
    const result = await chunkedIn<{ id: string }>(
      mockQueryBuilder(chunks), 'id', 'code', values, undefined, 2,
    );

    // 5 values with chunk size 2 → 3 chunks: [a,b], [c,d], [e]
    expect(chunks).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(result).toHaveLength(5);
    expect(result.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('applies extraFilters to every chunk query', async () => {
    const chunks: string[][] = [];
    const filterSpy = vi.fn();
    const values = ['x', 'y', 'z'];

    await chunkedIn<{ id: string }>(
      mockQueryBuilderWithFilters(chunks, filterSpy),
      'id',
      'code',
      values,
      (q) => (q as ReturnType<typeof q['eq']>).eq('client_id', 'c1'),
      2,
    );

    expect(chunks).toEqual([['x', 'y'], ['z']]);
    expect(filterSpy).toHaveBeenCalledTimes(2);
    expect(filterSpy).toHaveBeenCalledWith('eq', 'client_id', 'c1');
  });

  it('throws on query error and stops processing', async () => {
    let callCount = 0;
    const failingBuilder = () => ({
      select: () => ({
        in: () => {
          callCount++;
          if (callCount === 2) {
            return { data: null, error: new Error('PostgREST error') };
          }
          return { data: [{ id: '1' }], error: null };
        },
      }),
    });

    await expect(
      chunkedIn<{ id: string }>(
        failingBuilder as unknown as Parameters<typeof chunkedIn>[0],
        'id', 'code', ['a', 'b', 'c', 'd'], undefined, 2,
      ),
    ).rejects.toThrow('PostgREST error');

    expect(callCount).toBe(2);
  });
});

describe('chunkedUpsert', () => {
  it('returns empty array for empty rows', async () => {
    const chunks: Record<string, unknown>[][] = [];
    const result = await chunkedUpsert(
      mockSupabaseClient(chunks), 'invoices', [], 'client_id, invoice_serial_code', 'id', 2,
    );
    expect(result).toEqual([]);
    expect(chunks).toHaveLength(0);
  });

  it('sends a single upsert when rows fit in one chunk', async () => {
    const chunks: Record<string, unknown>[][] = [];
    const rows = [{ name: 'a' }, { name: 'b' }];
    const result = await chunkedUpsert<{ id: string }>(
      mockSupabaseClient(chunks), 'invoices', rows, 'client_id, invoice_serial_code', 'id', 3,
    );
    expect(chunks).toEqual([[{ name: 'a' }, { name: 'b' }]]);
    expect(result).toHaveLength(2);
  });

  it('splits rows into correct chunks and merges results', async () => {
    const chunks: Record<string, unknown>[][] = [];
    const rows = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }];
    const result = await chunkedUpsert<{ id: string }>(
      mockSupabaseClient(chunks), 'allowances', rows, 'client_id, allowance_serial_code', 'id', 2,
    );

    // 5 rows with chunk size 2 → 3 chunks
    expect(chunks).toEqual([
      [{ n: 1 }, { n: 2 }],
      [{ n: 3 }, { n: 4 }],
      [{ n: 5 }],
    ]);
    expect(result).toHaveLength(5);
  });

  it('throws on upsert error and stops processing', async () => {
    let callCount = 0;
    const failingClient = {
      from: () => ({
        upsert: () => {
          callCount++;
          return {
            select: () => {
              if (callCount === 2) {
                return { data: null, error: new Error('upsert failed') };
              }
              return { data: [{ id: '1' }], error: null };
            },
          };
        },
      }),
    } as unknown as Parameters<typeof chunkedUpsert>[0];

    await expect(
      chunkedUpsert<{ id: string }>(
        failingClient, 'invoices', [{ a: 1 }, { a: 2 }, { a: 3 }], 'id', 'id', 2,
      ),
    ).rejects.toThrow('upsert failed');

    expect(callCount).toBe(2);
  });
});

// ── Integration tests ─────────────────────────────────────────────────

const hasDbEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasDbEnv)("processElectronicInvoiceFile", () => {
  let supabase: ReturnType<typeof getServiceClient>;
  let fixture: TestFixture;

  beforeAll(async () => {
    supabase = getServiceClient();
    fixture = await createTestFixture(supabase);
  });

  afterAll(async () => {
    if (fixture) {
      await cleanupTestFixture(supabase, fixture);
    }
  });

  it("upserts invoices based on client_id + invoice_serial_code", async () => {
    const filePath = path.resolve(__dirname, "../../fixtures/files", "60707504.xlsx");
    const fileBuffer = readFileSync(filePath);
    const storagePath = `${fixture.firmId}/${fixture.clientId}/60707504.xlsx`;

    const { error: uploadError } = await supabase.storage
      .from("electronic-invoices")
      .upload(storagePath, fileBuffer, {
        contentType: "text/plain",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    fixture.storagePaths.push(storagePath);

    // Create a tax period for testing
    const testPeriod = "11411"; // 2025-11/12 match the excel file data

    await supabase.from("tax_filing_periods").insert({
      firm_id: fixture.firmId,
      client_id: fixture.clientId,
      year_month: testPeriod,
      status: "open"
    });

    const result1 = await processElectronicInvoiceFile(
      fixture.clientId,
      fixture.firmId,
      storagePath,
      "60707504.xlsx",
      testPeriod,
      {
        supabaseClient: supabase,
        userId: fixture.userId,
      }
    );

    expect(result1.failed).toBe(0);
    expect(result1.succeeded).toBeGreaterThan(0);

    const { data: rowsAfterFirst, error: countErrorFirst } = await supabase
      .from("invoices")
      .select("id, invoice_serial_code")
      .eq("client_id", fixture.clientId);

    if (countErrorFirst || !rowsAfterFirst) {
      throw countErrorFirst ?? new Error("Failed to fetch invoices after import");
    }

    const firstCount = rowsAfterFirst.length;
    expect(firstCount).toBeGreaterThan(0);
    expect(
      new Set(rowsAfterFirst.map((row) => row.invoice_serial_code)).size
    ).toBe(firstCount);

    const result2 = await processElectronicInvoiceFile(
      fixture.clientId,
      fixture.firmId,
      storagePath,
      "60707504.xlsx",
      testPeriod,
      {
        supabaseClient: supabase,
        userId: fixture.userId,
      }
    );

    expect(result2.failed).toBe(0);
    expect(result2.succeeded).toBe(firstCount);

    const { data: rowsAfterSecond, error: countErrorSecond } = await supabase
      .from("invoices")
      .select("id, invoice_serial_code")
      .eq("client_id", fixture.clientId);

    if (countErrorSecond || !rowsAfterSecond) {
      throw (
        countErrorSecond ?? new Error("Failed to fetch invoices after re-import")
      );
    }

    expect(rowsAfterSecond.length).toBe(firstCount);
    expect(
      new Set(rowsAfterSecond.map((row) => row.invoice_serial_code)).size
    ).toBe(firstCount);
  });
});
