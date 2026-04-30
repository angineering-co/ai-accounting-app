"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type UseFormReturn } from "react-hook-form";

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

/**
 * Convenience hook that wires useTaxIdLookup into a react-hook-form instance.
 * Looks up both seller and buyer names, skipping no-op updates.
 */
export function useFormTaxIdLookup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>,
  sellerTaxId: string,
  buyerTaxId: string,
): { sellerLoading: boolean; buyerLoading: boolean } {
  const formRef = useRef(form);
  formRef.current = form;

  const handleSellerName = useCallback((name: string) => {
    const f = formRef.current;
    if (f.getValues("sellerName") === name) return;
    f.setValue("sellerName", name);
    const conf = f.getValues("confidence");
    if (conf) f.setValue("confidence.sellerName", "high");
  }, []);

  const handleBuyerName = useCallback((name: string) => {
    const f = formRef.current;
    if (f.getValues("buyerName") === name) return;
    f.setValue("buyerName", name);
    const conf = f.getValues("confidence");
    if (conf) f.setValue("confidence.buyerName", "high");
  }, []);

  const { loading: sellerLoading } = useTaxIdLookup(sellerTaxId, handleSellerName);
  const { loading: buyerLoading } = useTaxIdLookup(buyerTaxId, handleBuyerName);

  return { sellerLoading, buyerLoading };
}
