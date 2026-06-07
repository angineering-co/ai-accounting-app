"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CalendarIcon, Filter, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TablePagination } from "@/components/table-pagination";
import { cn, formatDateToISO, formatNTD } from "@/lib/utils";
import { RocPeriod } from "@/lib/domain/roc-period";
import { getVoucherEntries, type VoucherListRow } from "@/lib/services/voucher";

type StatusFilter = "all" | "draft" | "posted" | "reversed";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "posted", label: "已過帳" },
  { key: "reversed", label: "已沖銷" },
];

const PAGE_SIZE = 25;

function StatusBadge({ status }: { status: VoucherListRow["status"] }) {
  if (status === "draft") {
    return (
      <Badge variant="outline" className="border-dashed text-muted-foreground">
        草稿
      </Badge>
    );
  }
  if (status === "reversed") {
    return (
      <Badge
        variant="outline"
        className="border-destructive/50 text-destructive line-through"
      >
        已沖銷
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
      ✓ 已過帳
    </Badge>
  );
}

export default function VoucherListPage({
  params,
}: {
  params: Promise<{ firmId: string; clientId: string }>;
}) {
  const { firmId, clientId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const { data, isLoading } = useSWR(
    ["voucher-entries", clientId],
    () => getVoucherEntries(clientId),
    { keepPreviousData: true },
  );
  const rows = useMemo(() => data ?? [], [data]);

  // Pre-filter to a period when linked from the period's 草稿傳票 card. Entries carry
  // no period_id, so this filters by entry_date within the period's calendar range —
  // a proxy for period membership (the chip says 依分錄日期 to be explicit).
  const periodParam = searchParams.get("period");
  const period = useMemo(() => {
    if (!periodParam || !/^\d{5}$/.test(periodParam)) return null;
    try {
      return RocPeriod.fromYYYMM(periodParam);
    } catch {
      return null;
    }
  }, [periodParam]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [periodActive, setPeriodActive] = useState<boolean>(false);
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(0);

  // Apply the ?period= range to the date filters whenever the param changes — including
  // soft navigations that keep this page mounted (arriving from 查看草稿傳票, switching
  // periods, or clearing the param via the sidebar). A useState initializer would only
  // seed once at mount and then drift from the URL. Manual date edits clear periodActive
  // (below) so the chip stops claiming the period once the range no longer matches it.
  useEffect(() => {
    if (period) {
      setDateFrom(formatDateToISO(period.startDate));
      setDateTo(formatDateToISO(period.endDate));
      setPeriodActive(true);
    } else {
      setDateFrom("");
      setDateTo("");
      setPeriodActive(false);
    }
    setPage(0);
  }, [period]);

  const { counts, filtered } = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: rows.length,
      draft: 0,
      posted: 0,
      reversed: 0,
    };
    const kw = keyword.trim();
    const list: VoucherListRow[] = [];
    for (const e of rows) {
      c[e.status] += 1;
      if (statusFilter !== "all" && e.status !== statusFilter) continue;
      if (dateFrom && e.entry_date < dateFrom) continue;
      if (dateTo && e.entry_date > dateTo) continue;
      if (docTypeFilter !== "all") {
        if (docTypeFilter === "system") {
          if (e.document_id != null) continue;
        } else if (e.doc_type !== docTypeFilter) {
          continue;
        }
      }
      if (kw) {
        const matches =
          (e.voucher_no?.includes(kw) ?? false) ||
          (e.description?.includes(kw) ?? false);
        if (!matches) continue;
      }
      list.push(e);
    }
    list.sort((a, b) => {
      if (a.entry_date !== b.entry_date)
        return b.entry_date.localeCompare(a.entry_date);
      return b.created_at.localeCompare(a.created_at);
    });
    return { counts: c, filtered: list };
  }, [rows, statusFilter, dateFrom, dateTo, docTypeFilter, keyword]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const hasActiveFilters =
    statusFilter !== "all" ||
    docTypeFilter !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(keyword);

  const clearFilters = () => {
    setStatusFilter("all");
    setDocTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setPeriodActive(false);
    setKeyword("");
    setPage(0);
  };

  const clearPeriod = () => {
    setDateFrom("");
    setDateTo("");
    setPeriodActive(false);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">傳票管理</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4" />
            篩選與批次操作
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {period && periodActive && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="flex items-center gap-2 text-base font-normal"
              >
                期間 {period.format()}（依分錄日期）
                <button
                  type="button"
                  onClick={clearPeriod}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="清除期間篩選"
                >
                  <X className="size-3.5" />
                </button>
              </Badge>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.key}
                size="sm"
                variant={statusFilter === tab.key ? "default" : "outline"}
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(0);
                }}
              >
                {tab.label}
                <span className="ml-2 text-sm opacity-70">{counts[tab.key]}</span>
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-sm text-muted-foreground">日期起</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start font-normal mt-1",
                      !dateFrom && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    {dateFrom || "（全部）"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom ? new Date(dateFrom) : undefined}
                    onSelect={(d) => {
                      setDateFrom(d ? format(d, "yyyy-MM-dd") : "");
                      setPeriodActive(false);
                      setPage(0);
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">日期迄</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start font-normal mt-1",
                      !dateTo && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 size-4" />
                    {dateTo || "（全部）"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo ? new Date(dateTo) : undefined}
                    onSelect={(d) => {
                      setDateTo(d ? format(d, "yyyy-MM-dd") : "");
                      setPeriodActive(false);
                      setPage(0);
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">文件類型</label>
              <Select
                value={docTypeFilter}
                onValueChange={(v) => {
                  setDocTypeFilter(v);
                  setPage(0);
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="invoice">發票</SelectItem>
                  <SelectItem value="allowance">折讓</SelectItem>
                  <SelectItem value="system">系統分錄（無原始憑證）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">關鍵字</label>
              <Input
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setPage(0);
                }}
                placeholder="傳票編號或摘要"
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-base text-muted-foreground">
              共 {filtered.length} 筆
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
              >
                <X className="size-4 mr-1" />
                清除篩選
              </Button>
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <div>
                      <Button disabled>批次過帳</Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>批次過帳功能將於 Phase 8 開放</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">日期</TableHead>
                <TableHead className="w-36">傳票編號</TableHead>
                <TableHead className="w-20">類型</TableHead>
                <TableHead>摘要</TableHead>
                <TableHead className="w-36 text-right">借 / 貸</TableHead>
                <TableHead className="w-24">狀態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-base">
                    載入中…
                  </TableCell>
                </TableRow>
              ) : pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-base">
                    尚無符合條件的傳票
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((entry) => (
                  <TableRow
                    key={entry.id}
                    className={cn(
                      entry.status === "draft" && "bg-muted/30",
                      entry.status === "reversed" && "opacity-60",
                    )}
                  >
                    <TableCell className="font-mono text-base">
                      <Link
                        href={`/firm/${firmId}/client/${clientId}/voucher/${entry.id}`}
                        className="block hover:underline"
                      >
                        {entry.entry_date}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-base font-medium">
                      <Link
                        href={`/firm/${firmId}/client/${clientId}/voucher/${entry.id}`}
                        className="block hover:underline"
                      >
                        {entry.voucher_no ?? "（無編號）"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-base">{entry.voucher_type}</TableCell>
                    <TableCell className="text-base max-w-[420px]">
                      <div className="line-clamp-2">{entry.description ?? "—"}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-base">
                      {formatNTD(entry.debit)}
                      <span className="mx-1 text-muted-foreground">/</span>
                      {formatNTD(entry.credit)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={entry.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TablePagination
        page={safePage}
        totalPages={totalPages}
        totalItems={filtered.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  );
}
