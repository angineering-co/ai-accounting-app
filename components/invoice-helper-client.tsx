"use client";

import { useState, useEffect } from "react";
import { InvoiceHelperForm } from "./invoice-helper-form";
import { InvoicePreview } from "./invoice-preview";

export type InvoiceVariant = "二聯式" | "三聯式";
export type TaxType = "應稅" | "零稅率" | "免稅";

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface InvoiceFormData {
  variant: InvoiceVariant;
  rocYear: number;
  month: number;
  day: number;
  buyerName: string;
  buyerTaxId: string;
  items: LineItem[];
  taxType: TaxType;
  // Bidirectional tax: track which field was last manually edited
  // null = compute from item sum, "salesAmount" or "totalAmount" = user override
  manualOverride: null | "salesAmount" | "totalAmount";
  salesAmountOverride: number;
  totalAmountOverride: number;
}

let nextItemId = 1;

function createEmptyItem(): LineItem {
  return {
    id: String(nextItemId++),
    description: "",
    quantity: 1,
    unitPrice: 0,
    amount: 0,
  };
}

function getDefaultFormData(): InvoiceFormData {
  return {
    variant: "三聯式",
    rocYear: 0,
    month: 0,
    day: 0,
    buyerName: "",
    buyerTaxId: "",
    items: [createEmptyItem()],
    taxType: "應稅",
    manualOverride: null,
    salesAmountOverride: 0,
    totalAmountOverride: 0,
  };
}

export function computeTotals(data: InvoiceFormData) {
  const itemSum = data.items.reduce((sum, item) => sum + item.amount, 0);

  if (data.taxType !== "應稅") {
    return { salesAmount: itemSum, tax: 0, totalAmount: itemSum };
  }

  // If user manually entered a sales amount (pre-tax), compute total from it
  if (data.manualOverride === "salesAmount" && data.salesAmountOverride > 0) {
    const sales = data.salesAmountOverride;
    const tax = Math.round(sales * 0.05);
    return { salesAmount: sales, tax, totalAmount: sales + tax };
  }

  // If user manually entered a total amount (post-tax), compute sales from it
  if (data.manualOverride === "totalAmount" && data.totalAmountOverride > 0) {
    const total = data.totalAmountOverride;
    const sales = Math.round(total / 1.05);
    const tax = total - sales;
    return { salesAmount: sales, tax, totalAmount: total };
  }

  // 二聯式: item prices are tax-inclusive, so item sum = total amount
  if (data.variant === "二聯式") {
    const sales = Math.round(itemSum / 1.05);
    const tax = itemSum - sales;
    return { salesAmount: sales, tax, totalAmount: itemSum };
  }

  // 三聯式: item prices are pre-tax (sales amount), add tax on top
  const tax = Math.round(itemSum * 0.05);
  return { salesAmount: itemSum, tax, totalAmount: itemSum + tax };
}

/** Get bimonthly period string, e.g., "三、四" for months 3-4 */
export function getBimonthlyPeriod(month: number): string {
  const cnNums = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
  // Bimonthly: 1-2, 3-4, 5-6, 7-8, 9-10, 11-12
  const startMonth = month % 2 === 0 ? month - 1 : month;
  const endMonth = startMonth + 1;
  return `${cnNums[startMonth - 1]}、${cnNums[endMonth - 1]}`;
}

/** Convert ROC year to Chinese numerals, e.g., 115 → "一一五" */
export function rocYearToChinese(year: number): string {
  const cnDigits = ["○", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  return String(year)
    .split("")
    .map((d) => cnDigits[parseInt(d)])
    .join("");
}

export { createEmptyItem };

export function InvoiceHelperClient() {
  const [formData, setFormData] = useState<InvoiceFormData>(getDefaultFormData);

  // Set today's date on mount to avoid SSR/prerender issues with new Date()
  useEffect(() => {
    const now = new Date();
    setFormData((prev) => ({
      ...prev,
      rocYear: now.getFullYear() - 1911,
      month: now.getMonth() + 1,
      day: now.getDate(),
    }));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <InvoiceHelperForm data={formData} onChange={setFormData} />
      <InvoicePreview data={formData} />
    </div>
  );
}
