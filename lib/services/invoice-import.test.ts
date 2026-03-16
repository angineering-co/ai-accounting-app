import { describe, it, expect, vi } from 'vitest';
import { chunkedIn, chunkedUpsert } from './invoice-import';

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
  // Cast to satisfy the generic — the mock implements the used interface
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
          // Allow extra chained filter calls to return itself
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
    // extraFilter called once per chunk
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

    // Should have stopped at the second chunk
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
