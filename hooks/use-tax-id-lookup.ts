"use client";

import { useEffect, useRef, useState } from "react";

/**
 * React hook that looks up a business name from Taiwan's FIA registry
 * when a valid 8-digit tax ID (統一編號) is provided.
 *
 * Best-effort only — silently ignores failures.
 */
export function useTaxIdLookup(
  taxId: string,
  onResult: (name: string) => void,
): { loading: boolean } {
  const abortRef = useRef<AbortController | null>(null);
  const lastLookedUp = useRef<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (taxId.length !== 8 || taxId === lastLookedUp.current) return;
    lastLookedUp.current = taxId;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);

    fetch(
      `https://eip.fia.gov.tw/OAI/api/businessRegistration/${taxId}`,
      { signal: controller.signal },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.businessNm) onResult(data.businessNm);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [taxId, onResult]);

  return { loading };
}
