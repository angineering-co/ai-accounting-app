"use client";

import { PostgrestQueryBuilder, type PostgrestClientOptions } from "@supabase/postgrest-js";
import { type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type SupabaseClientType = typeof supabase;
type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;

type Database =
  SupabaseClientType extends SupabaseClient<infer U>
    ? IfAny<
        U,
        {
          public: {
            Tables: Record<string, { Row: Record<string, unknown> }>;
            Views: Record<string, unknown>;
            Functions: Record<string, unknown>;
          };
        },
        U
      >
    : {
        public: {
          Tables: Record<string, { Row: Record<string, unknown> }>;
          Views: Record<string, unknown>;
          Functions: Record<string, unknown>;
        };
      };

type DatabaseSchema = Database["public"];
export type SupabaseTableName = keyof DatabaseSchema["Tables"];
export type SupabaseTableData<T extends SupabaseTableName> =
  DatabaseSchema["Tables"][T]["Row"];

type DefaultClientOptions = PostgrestClientOptions;
type SupabaseSelectBuilder<T extends SupabaseTableName> = ReturnType<
  PostgrestQueryBuilder<
    DefaultClientOptions,
    DatabaseSchema,
    DatabaseSchema["Tables"][T],
    T
  >["select"]
>;

export type SupabaseQueryHandler<T extends SupabaseTableName> = (
  query: SupabaseSelectBuilder<T>,
) => SupabaseSelectBuilder<T>;

export interface UseInfiniteQueryProps<T extends SupabaseTableName> {
  tableName: T;
  columns?: string;
  pageSize?: number;
  trailingQuery?: SupabaseQueryHandler<T>;
}

interface StoreState<TData> {
  data: TData[];
  count: number;
  isSuccess: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  hasInitialFetch: boolean;
}

type Listener = () => void;

function createStore<TData extends SupabaseTableData<T>, T extends SupabaseTableName>(
  props: UseInfiniteQueryProps<T>,
) {
  const { tableName, columns = "*", pageSize = 20, trailingQuery } = props;

  let state: StoreState<TData> = {
    data: [],
    count: 0,
    isSuccess: false,
    isLoading: false,
    isFetching: false,
    error: null,
    hasInitialFetch: false,
  };

  const listeners = new Set<Listener>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const setState = (newState: Partial<StoreState<TData>>) => {
    state = { ...state, ...newState };
    notify();
  };

  const fetchPage = async (skip: number) => {
    if (state.hasInitialFetch && (state.isFetching || state.count <= state.data.length)) {
      return;
    }

    setState({ isFetching: true });

    let query = supabase
      .from(tableName)
      .select(columns, { count: "exact" }) as unknown as SupabaseSelectBuilder<T>;

    if (trailingQuery) {
      query = trailingQuery(query);
    }

    const { data: newData, count, error } = await query.range(skip, skip + pageSize - 1);

    if (error) {
      setState({ error: error as Error });
    } else {
      setState({
        data: [...state.data, ...((newData ?? []) as TData[])],
        count: count ?? 0,
        isSuccess: true,
        error: null,
      });
    }

    setState({ isFetching: false });
  };

  const fetchNextPage = async () => {
    if (state.isFetching) return;
    await fetchPage(state.data.length);
  };

  const initialize = async () => {
    setState({
      data: [],
      count: 0,
      isSuccess: false,
      isLoading: true,
      error: null,
      hasInitialFetch: false,
    });
    await fetchNextPage();
    setState({ isLoading: false, hasInitialFetch: true });
  };

  return {
    getState: () => state,
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fetchNextPage,
    initialize,
  };
}

const initialState: StoreState<unknown> = {
  data: [],
  count: 0,
  isSuccess: false,
  isLoading: false,
  isFetching: false,
  error: null,
  hasInitialFetch: false,
};

/**
 * Based on Supabase Infinite Query Hook:
 * https://supabase.com/ui/docs/infinite-query-hook
 *
 * Project-specific additions:
 * - Config-change store reset guard (via propsRef + isSameConfig).
 * - `refresh()` API to force a full re-initialize from first page.
 */
export function useInfiniteQuery<
  TData extends SupabaseTableData<T>,
  T extends SupabaseTableName = SupabaseTableName,
>(props: UseInfiniteQueryProps<T>) {
  const propsRef = useRef(props);
  const storeRef = useRef(createStore<TData, T>(props));

  // Custom vs Supabase doc version:
  // We keep a stable store instance and recreate it only when config changes.
  // This prevents unnecessary refetch/store resets on normal renders.
  const isSameConfig =
    propsRef.current.tableName === props.tableName &&
    propsRef.current.columns === props.columns &&
    propsRef.current.pageSize === props.pageSize &&
    propsRef.current.trailingQuery === props.trailingQuery;

  if (!isSameConfig) {
    propsRef.current = props;
    storeRef.current = createStore<TData, T>(props);
  }

  const state = useSyncExternalStore(
    storeRef.current.subscribe,
    () => storeRef.current.getState(),
    () => initialState as StoreState<TData>,
  );

  useEffect(() => {
    if (!state.hasInitialFetch && typeof window !== "undefined") {
      void storeRef.current.initialize();
    }
  }, [state.hasInitialFetch]);

  // Custom helper not in the original snippet:
  // Re-runs initialize() to clear accumulated pages and fetch from page 1.
  // Useful after mutations (upload/delete/update) when caller needs fresh list data.
  const refresh = useCallback(async () => {
    await storeRef.current.initialize();
  }, []);

  return {
    data: state.data,
    count: state.count,
    isSuccess: state.isSuccess,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    error: state.error,
    hasMore: state.count > state.data.length,
    fetchNextPage: storeRef.current.fetchNextPage,
    refresh,
  };
}
