"use client";

import type { InvoiceFormData } from "./invoice-helper-client";
import {
  computeTotals,
  getBimonthlyPeriod,
  rocYearToChinese,
} from "./invoice-helper-client";

interface InvoicePreviewProps {
  data: InvoiceFormData;
}

/** Max line items visible on the invoice paper */
const MAX_ITEM_ROWS = 4;
/** 三聯式 totals: 銷售額合計 + 營業稅 label + 營業稅 checkmark + 總計 */
const TOTALS_ROWS_三聯 = 4;
/** 二聯式 totals: 總計 only */
const TOTALS_ROWS_二聯 = 1;

function fmt(n: number): string {
  return n ? n.toLocaleString("zh-TW") : "";
}

/** Fixed-width display for the Chinese amount row */
function ChineseAmountRow({ amount }: { amount: number }) {
  const units = [
    { label: "億", key: "yi" },
    { label: "仟", key: "qian1" },
    { label: "佰", key: "bai1" },
    { label: "拾", key: "shi1" },
    { label: "萬", key: "wan" },
    { label: "仟", key: "qian2" },
    { label: "佰", key: "bai2" },
    { label: "拾", key: "shi2" },
    { label: "元", key: "yuan" },
  ];
  const str = String(Math.floor(amount)).padStart(9, "0");
  const cnDigits = [
    "○",
    "壹",
    "貳",
    "參",
    "肆",
    "伍",
    "陸",
    "柒",
    "捌",
    "玖",
  ];

  // Find index of first non-zero digit to determine leading zeros
  const firstNonZero = str.split("").findIndex((d) => d !== "0");
  const leadingZeroCount = amount > 0 && firstNonZero > 0 ? firstNonZero : 0;

  return (
    <div className="flex items-center border-t border-slate-600">
      <div className="w-[100px] shrink-0 text-xs leading-tight px-2 py-1">
        <div>總計新臺幣</div>
        <div>(中文大寫)</div>
      </div>
      <div className="flex flex-1 relative">
        {units.map(({ label, key }, i) => (
          <div
            key={key}
            className="flex-1 text-center border-l border-slate-400 py-1"
          >
            <div className="text-[11px] text-slate-400">{label}</div>
            <div className="relative font-medium text-base text-blue-600">
              {amount > 0 ? cnDigits[parseInt(str[i])] : ""}
              {/* Strikethrough: spans from this cell to the right edge for the first leading zero */}
              {i === 0 && leadingZeroCount > 0 && (
                <div
                  className="absolute top-1/2 left-0 -translate-y-1/2 h-0.5 bg-blue-600 z-10 pointer-events-none"
                  style={{ width: `${leadingZeroCount * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CrossMark() {
  return (
    <svg
      viewBox="0 0 100 30"
      className="w-full h-full text-slate-300"
      preserveAspectRatio="none"
    >
      <line
        x1="0"
        y1="0"
        x2="100"
        y2="30"
        stroke="currentColor"
        strokeWidth="1"
      />
      <line
        x1="0"
        y1="30"
        x2="100"
        y2="0"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

function DateDisplay({ data }: { data: InvoiceFormData }) {
  return (
    <span>
      中華民國{" "}
      <span className="text-blue-600 font-medium">
        {data.rocYear || "___"}
      </span>
      年{" "}
      <span className="text-blue-600 font-medium">{data.month || "__"}</span>{" "}
      月{" "}
      <span className="text-blue-600 font-medium">{data.day || "__"}</span> 日
    </span>
  );
}

export function InvoicePreview({ data }: InvoicePreviewProps) {
  const { salesAmount, tax, totalAmount } = computeTotals(data);
  const is三聯 = data.variant === "三聯式";

  const rocCn = data.rocYear ? rocYearToChinese(data.rocYear) : "＿＿＿";
  const bimonthly = data.month ? getBimonthlyPeriod(data.month) : "＿、＿";

  const filledItems = data.items.slice(0, MAX_ITEM_ROWS);
  const emptyRows = Math.max(0, MAX_ITEM_ROWS - filledItems.length);
  const hasContent = filledItems.some(
    (item) => item.description || item.amount
  );

  // Stamp column spans from first item row through all totals rows
  const stampTotalRows =
    MAX_ITEM_ROWS + (is三聯 ? TOTALS_ROWS_三聯 : TOTALS_ROWS_二聯);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-100 p-3 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-500">發票預覽</p>
        <p className="text-xs text-slate-400 sm:hidden">左右滑動查看完整發票</p>
      </div>

      {/* Horizontal scroll wrapper for mobile */}
      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
      {/* Invoice Paper — wider rectangular shape */}
      <div className="bg-white border-[3px] border-amber-700 text-slate-800 shadow-lg w-full min-w-[480px]">
        {/* Title area */}
        <div className="px-6 pt-5 pb-2">
          <div className="flex items-start justify-between">
            <span className="text-lg font-bold text-slate-400 font-mono">
              XX
            </span>
            <div className="text-center flex-1">
              <div className="tracking-[0.6em] text-xl font-bold">
                統 一 發 票（{data.variant}）
              </div>
            </div>
            <span className="text-lg invisible">XX</span>
          </div>

          {/* Period */}
          <div className="text-center text-base mt-1.5">
            <span className="text-blue-600 font-medium">{rocCn}</span>年{" "}
            <span className="text-blue-600 font-medium">{bimonthly}</span>{" "}
            月份
          </div>
        </div>

        {/* Buyer & Date section */}
        <div className="px-6 py-2 space-y-1.5 text-sm">
          {is三聯 ? (
            <>
              <div className="flex gap-2">
                <span className="shrink-0 tracking-[0.3em]">買受人：</span>
                <span className="text-blue-600 font-medium">
                  {data.buyerName || ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="shrink-0 tracking-[0.3em]">統一編號：</span>
                {data.buyerTaxId ? (
                  <span className="font-mono text-blue-600 font-medium whitespace-nowrap">
                    {data.buyerTaxId.split("").join(" ")}
                  </span>
                ) : (
                  <span className="flex gap-1">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <span
                        key={i}
                        className="w-5 h-5 border border-slate-300 inline-block"
                      />
                    ))}
                  </span>
                )}
                <span className="ml-auto">
                  <DateDisplay data={data} />
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <span className="shrink-0 tracking-[0.3em]">買受人：</span>
              </div>
              <div className="text-right">
                <DateDisplay data={data} />
              </div>
            </>
          )}
          {/* Address row */}
          <div className="flex gap-1 text-xs text-slate-400">
            <span className="tracking-[0.2em]">地　址：</span>
            <span>縣市　鄉鎮市區　路街　段　巷　弄　號　樓　室</span>
          </div>
        </div>

        {/* Items + Totals table with spanning 備註/stamp column */}
        <div className="border-t-2 border-slate-600">
          <table className="w-full border-collapse text-sm">
            {/* Column widths */}
            <colgroup>
              <col className="w-[35%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[25%]" />
            </colgroup>

            {/* Table Header */}
            <thead>
              <tr className="border-b-2 border-slate-600 text-center font-medium">
                <th className="px-3 py-2 border-r border-slate-400 font-medium">
                  <span className="tracking-[1.2em]">品</span>名
                </th>
                <th className="px-2 py-2 border-r border-slate-400 font-medium">
                  <span className="tracking-[0.3em]">數量</span>
                </th>
                <th className="px-2 py-2 border-r border-slate-400 font-medium">
                  <span className="tracking-[0.3em]">單價</span>
                </th>
                <th className="px-2 py-2 border-r border-slate-400 font-medium">
                  <span className="tracking-[1.2em]">金</span>額
                </th>
                <th className="px-2 py-2 font-medium">
                  <span className="tracking-[1.2em]">備</span>註
                </th>
              </tr>
            </thead>

            <tbody>
              {/* Item rows + stamp area spanning right column */}
              {filledItems.map((item, index) => (
                <tr key={item.id} className="border-b border-slate-300">
                  <td className="px-3 py-2.5 border-r border-slate-300 truncate text-blue-600 font-medium">
                    {item.description || ""}
                  </td>
                  <td className="px-2 py-2.5 border-r border-slate-300 text-center font-mono text-blue-600">
                    {item.quantity || ""}
                  </td>
                  <td className="px-2 py-2.5 border-r border-slate-300 text-right font-mono text-blue-600">
                    {item.unitPrice ? fmt(item.unitPrice) : ""}
                  </td>
                  <td className="px-3 py-2.5 border-r border-slate-300 text-right font-mono text-blue-600">
                    {item.amount ? fmt(item.amount) : ""}
                  </td>
                  {/* Stamp cell: rowSpan from first item row through all remaining rows */}
                  {index === 0 && (
                    <td
                      rowSpan={stampTotalRows}
                      className="border-b border-slate-300 align-bottom"
                    >
                      <div className="flex flex-col items-center justify-end h-full px-2 pb-3">
                        <div className="text-xs text-blue-600 text-center leading-relaxed mb-1.5">
                          營業人蓋用
                          <br />
                          統一發票專用章
                        </div>
                        <div className="w-28 h-28 border-2 border-dashed border-blue-300 rounded" />
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {/* Empty rows with X cross-out */}
              {Array.from({ length: emptyRows }).map((_, i) => (
                <tr key={`empty-${i}`} className="border-b border-slate-300">
                  <td className="px-3 py-2.5 border-r border-slate-300" />
                  <td className="px-2 py-2.5 border-r border-slate-300" />
                  <td className="px-2 py-2.5 border-r border-slate-300" />
                  <td className="px-3 py-2.5 border-r border-slate-300 relative h-10">
                    {hasContent && <CrossMark />}
                  </td>
                  {/* stamp column already spanned */}
                </tr>
              ))}

              {/* Totals rows */}
              {is三聯 ? (
                <>
                  {/* 銷售額合計 */}
                  <tr className="border-t-2 border-slate-600 border-b border-slate-400">
                    <td
                      colSpan={3}
                      className="px-3 py-2 border-r border-slate-400 tracking-[0.5em] font-medium"
                    >
                      銷售額合計
                    </td>
                    <td className="px-3 py-2 border-r border-slate-300 text-right font-mono text-blue-600 font-medium">
                      {fmt(salesAmount)}
                    </td>
                  </tr>

                  {/* 營業稅 label row */}
                  <tr className="border-b border-slate-400">
                    <td className="px-3 py-2 border-r border-slate-400 font-medium">
                      <span className="tracking-[0.3em]">營業稅</span>
                    </td>
                    <td
                      colSpan={2}
                      className="border-r border-slate-400 text-xs"
                    >
                      <div className="flex h-full">
                        <div className="flex-1 border-r border-slate-300 flex items-center justify-center">
                          應稅
                        </div>
                        <div className="flex-1 border-r border-slate-300 flex items-center justify-center">
                          零稅率
                        </div>
                        <div className="flex-1 flex items-center justify-center">
                          免稅
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 border-r border-slate-300 text-right font-mono text-blue-600 font-medium">
                      {data.taxType === "應稅" ? fmt(tax) : ""}
                    </td>
                  </tr>

                  {/* 營業稅 checkmark row */}
                  <tr className="border-b border-slate-400">
                    <td className="px-3 py-1 border-r border-slate-400" />
                    <td colSpan={2} className="border-r border-slate-400">
                      <div className="flex text-sm h-full">
                        <div className="flex-1 border-r border-slate-300 flex items-center justify-center font-bold text-blue-600">
                          {data.taxType === "應稅" ? "V" : ""}
                        </div>
                        <div className="flex-1 border-r border-slate-300 flex items-center justify-center font-bold text-blue-600">
                          {data.taxType === "零稅率" ? "V" : ""}
                        </div>
                        <div className="flex-1 flex items-center justify-center font-bold text-blue-600">
                          {data.taxType === "免稅" ? "V" : ""}
                        </div>
                      </div>
                    </td>
                    <td className="border-r border-slate-300" />
                  </tr>

                  {/* 總計 */}
                  <tr className="border-b border-slate-600">
                    <td
                      colSpan={3}
                      className="px-3 py-2 border-r border-slate-400 tracking-[2em] font-bold"
                    >
                      總計
                    </td>
                    <td className="px-3 py-2 border-r border-slate-300 text-right font-mono text-blue-600 font-bold">
                      {fmt(totalAmount)}
                    </td>
                  </tr>
                </>
              ) : (
                <>
                  {/* 二聯式: 總計 */}
                  <tr className="border-t-2 border-slate-600 border-b border-slate-600">
                    <td
                      colSpan={3}
                      className="px-3 py-2 border-r border-slate-400 tracking-[2em] font-bold"
                    >
                      總計
                    </td>
                    <td className="px-3 py-2 border-r border-slate-300 text-right font-mono text-blue-600 font-bold">
                      {fmt(totalAmount)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Chinese amount row */}
        <ChineseAmountRow amount={totalAmount} />

        {/* 課稅別 for 二聯式 */}
        {!is三聯 && (
          <div className="flex border-t border-slate-600 text-sm">
            <div className="px-3 py-2 border-r border-slate-400 font-medium w-[100px]">
              <span className="tracking-[0.5em]">課稅別</span>
            </div>
            <div className="flex-1 flex">
              <div className="flex-1 border-r border-slate-300 flex items-center justify-center">
                應稅
              </div>
              <div className="flex-none w-10 border-r border-slate-300 flex items-center justify-center font-bold text-blue-600">
                {data.taxType === "應稅" ? "V" : ""}
              </div>
              <div className="flex-1 border-r border-slate-300 flex items-center justify-center">
                零稅率
              </div>
              <div className="flex-none w-10 border-r border-slate-300 flex items-center justify-center font-bold text-blue-600">
                {data.taxType === "零稅率" ? "V" : ""}
              </div>
              <div className="flex-1 border-r border-slate-300 flex items-center justify-center">
                免稅
              </div>
              <div className="flex-none w-10 flex items-center justify-center font-bold text-blue-600">
                {data.taxType === "免稅" ? "V" : ""}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 text-[10px] text-slate-400 flex justify-between border-t border-slate-400">
          <span>
            ※應稅、零稅率、免稅之銷售額應分別開立統一發票，並應於各該欄打「✓」。
          </span>
          <span>第　聯　聯</span>
        </div>
      </div>
      </div>{/* end scroll wrapper */}
    </div>
  );
}
