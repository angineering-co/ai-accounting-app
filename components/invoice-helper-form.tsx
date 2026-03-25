"use client";

import { useCallback, useEffect, useRef } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  InvoiceFormData,
  InvoiceVariant,
  TaxType,
  LineItem,
} from "./invoice-helper-client";
import { createEmptyItem, computeTotals } from "./invoice-helper-client";

function useTaxIdLookup(
  taxId: string,
  onResult: (name: string) => void
) {
  const abortRef = useRef<AbortController | null>(null);
  const lastLookedUp = useRef<string>("");

  useEffect(() => {
    if (taxId.length !== 8 || taxId === lastLookedUp.current) return;
    lastLookedUp.current = taxId;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    fetch(
      `https://eip.fia.gov.tw/OAI/api/businessRegistration/${taxId}`,
      { signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.businessNm) onResult(data.businessNm);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [taxId, onResult]);
}

interface InvoiceHelperFormProps {
  data: InvoiceFormData;
  onChange: (data: InvoiceFormData) => void;
}

export function InvoiceHelperForm({ data, onChange }: InvoiceHelperFormProps) {
  const totals = computeTotals(data);
  const latestRef = useRef({ data, onChange });
  latestRef.current = { data, onChange };

  function update(patch: Partial<InvoiceFormData>) {
    onChange({ ...data, ...patch });
  }

  const handleLookupResult = useCallback((name: string) => {
    const { data: d, onChange: cb } = latestRef.current;
    if (d.buyerName === name) return;
    cb({ ...d, buyerName: name });
  }, []);

  useTaxIdLookup(data.buyerTaxId, handleLookupResult);

  function updateItem(index: number, patch: Partial<LineItem>) {
    const items = data.items.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, ...patch };
      updated.amount = updated.quantity * updated.unitPrice;
      return updated;
    });
    // When items change, clear manual override so totals recompute from items
    update({ items, manualOverride: null });
  }

  function addItem() {
    update({ items: [...data.items, createEmptyItem()], manualOverride: null });
  }

  function removeItem(index: number) {
    if (data.items.length <= 1) return;
    update({
      items: data.items.filter((_, i) => i !== index),
      manualOverride: null,
    });
  }

  // Shared class for enlarged inputs (buyer info, tax totals)
  const largeInputClass = "h-12 sm:h-10 text-lg";

  return (
    <div className="space-y-6">
      {/* Invoice Variant Toggle */}
      <div>
        <Label className="text-base font-medium text-slate-700 mb-2 block">
          發票類型
        </Label>
        <Tabs
          value={data.variant}
          onValueChange={(v) => update({ variant: v as InvoiceVariant })}
        >
          <TabsList className="w-full h-12 sm:h-11">
            <TabsTrigger value="二聯式" className="flex-1 text-base h-10 sm:h-9">
              <span className="sm:hidden">二聯式</span>
              <span className="hidden sm:inline">二聯式統一發票</span>
            </TabsTrigger>
            <TabsTrigger value="三聯式" className="flex-1 text-base h-10 sm:h-9">
              <span className="sm:hidden">三聯式</span>
              <span className="hidden sm:inline">三聯式統一發票</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Buyer Info - 三聯式 only */}
      {data.variant === "三聯式" && (
        <div className="space-y-3">
          <Label className="text-base font-medium text-slate-700 block">
            買受人
          </Label>
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <Label className="text-sm text-slate-600 mb-1 block">
                統一編號
              </Label>
              <Input
                placeholder="12345678"
                maxLength={8}
                value={data.buyerTaxId}
                onChange={(e) =>
                  update({
                    buyerTaxId: e.target.value.replace(/\D/g, ""),
                  })
                }
                className={`font-mono ${largeInputClass}`}
              />
            </div>
            <div>
              <Label className="text-sm text-slate-600 mb-1 block flex items-center gap-1">
                公司名稱
                {data.buyerTaxId.length === 8 && !data.buyerName && (
                  <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                )}
              </Label>
              <Input
                placeholder="輸入統編自動帶入"
                value={data.buyerName}
                onChange={(e) => update({ buyerName: e.target.value })}
                className={largeInputClass}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tax Type */}
      <div>
        <Label className="text-base font-medium text-slate-700 mb-2 block">
          課稅別
        </Label>
        <RadioGroup
          value={data.taxType}
          onValueChange={(v) => update({ taxType: v as TaxType })}
          className="flex flex-wrap gap-6 sm:gap-5"
        >
          {(["應稅", "零稅率", "免稅"] as const).map((type) => (
            <div key={type} className="flex items-center gap-2.5">
              <RadioGroupItem value={type} id={`tax-${type}`} className="h-5 w-5" />
              <Label
                htmlFor={`tax-${type}`}
                className="text-base cursor-pointer"
              >
                {type}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Line Items */}
      <div>
        <Label className="text-base font-medium text-slate-700 mb-2 block">
          品名明細
        </Label>
        <div className="space-y-3">
          {/* Header row — hidden on mobile */}
          <div className="hidden sm:flex gap-2 items-center text-sm text-slate-600 font-medium">
            <div className="flex-1 min-w-0">品名</div>
            <div className="w-16 text-center">數量</div>
            <div className="w-24 text-right">單價</div>
            <div className="w-24 text-right pr-2">金額</div>
            <div className="w-9" />
          </div>
          {data.items.map((item, index) => (
            <div key={item.id}>
              {/* Desktop: horizontal row */}
              <div className="hidden sm:flex gap-2 items-start">
                <div className="flex-1 min-w-0">
                  <Input
                    placeholder="品名"
                    value={item.description}
                    onChange={(e) =>
                      updateItem(index, { description: e.target.value })
                    }
                  />
                </div>
                <div className="w-16">
                  <Input
                    type="number"
                    min={0}
                    placeholder="1"
                    value={item.quantity || ""}
                    onChange={(e) =>
                      updateItem(index, {
                        quantity: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="text-center"
                  />
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={item.unitPrice || ""}
                    onChange={(e) =>
                      updateItem(index, {
                        unitPrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="text-right font-mono"
                  />
                </div>
                <div className="w-24 flex items-center">
                  <span className="w-full text-right font-mono text-sm text-slate-700 tabular-nums px-2 py-2">
                    {item.amount ? item.amount.toLocaleString() : ""}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(index)}
                  disabled={data.items.length <= 1}
                  className="shrink-0 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {/* Mobile: stacked card layout */}
              <div className="sm:hidden rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="品名"
                    value={item.description}
                    onChange={(e) =>
                      updateItem(index, { description: e.target.value })
                    }
                    className="h-11 text-lg flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(index)}
                    disabled={data.items.length <= 1}
                    className="shrink-0 h-11 w-11 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-sm text-slate-500 mb-1 block">數量</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="1"
                      value={item.quantity || ""}
                      onChange={(e) =>
                        updateItem(index, {
                          quantity: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-11 text-lg text-center"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-500 mb-1 block">單價</Label>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={item.unitPrice || ""}
                      onChange={(e) =>
                        updateItem(index, {
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="h-11 text-lg text-right font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-slate-500 mb-1 block">金額</Label>
                    <div className="h-11 flex items-center justify-end font-mono text-lg text-slate-700 tabular-nums px-2 bg-white rounded-md border border-slate-200">
                      {item.amount ? item.amount.toLocaleString() : "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={addItem}
          className="mt-3 h-11 sm:h-10 text-base"
        >
          <Plus className="h-5 w-5 mr-1" />
          新增品項
        </Button>
      </div>

      {/* Bidirectional Tax Totals (only for 應稅) */}
      {data.taxType === "應稅" && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-sm text-slate-500">
            {data.variant === "二聯式"
              ? "二聯式發票品項金額為含稅價，系統自動反算未稅金額"
              : "三聯式發票品項金額為未稅價，系統自動加計營業稅"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-sm text-slate-600 mb-1 block">
                未稅金額（銷售額）
              </Label>
              <Input
                type="number"
                min={0}
                value={totals.salesAmount || ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  update({
                    manualOverride: "salesAmount",
                    salesAmountOverride: val,
                  });
                }}
                className={`font-mono text-right ${largeInputClass}`}
              />
            </div>
            <div>
              <Label className="text-sm text-slate-600 mb-1 block">
                含稅金額（總計）
              </Label>
              <Input
                type="number"
                min={0}
                value={totals.totalAmount || ""}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  update({
                    manualOverride: "totalAmount",
                    totalAmountOverride: val,
                  });
                }}
                className={`font-mono text-right ${largeInputClass}`}
              />
            </div>
          </div>
          <div className="text-base text-slate-600 text-right">
            營業稅（5%）：
            <span className="font-mono font-medium">
              {totals.tax.toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
