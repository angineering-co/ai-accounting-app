"use client";

import { SWRConfig } from "swr";

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 5000,
        errorRetryCount: 3,
        errorRetryInterval: 3000,
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        keepPreviousData: true,
        focusThrottleInterval: 10000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
