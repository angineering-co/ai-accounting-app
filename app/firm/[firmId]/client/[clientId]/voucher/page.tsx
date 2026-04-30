"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CalendarIcon, Filter, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { TablePagination } from "@/components/table-pagination";
import { cn, formatNTD } from "@/lib/utils";

import {
  seedVoucherDemoFor,
  useVoucherDemoStore,
} from "@/lib/dev/use-voucher-demo-store";
import {
  buildLineSumsMap,
  type JournalEntry,
} from "@/lib/domain/journal-entry";
import { VoucherBatchPostDialog } from "@/components/voucher-batch-post-dialog";

type StatusFilter = "all" | "draft" | "posted" | "reversed";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "posted", label: "已過帳" },
  { key: "reversed", label: "已沖銷" },
];

const PAGE_SIZE = 25;

function StatusBadge({ entry }: { entry: JournalEntry }) {
  if (entry.status === "draft") {
    return (
      <Badge variant="outline" className="border-dashed text-muted-foreground">
        草稿
      </Badge>
    );
  }
  if (entry.status === "reversed") {
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
  const store = useVoucherDemoStore();

  useEffect(() => {
    seedVoucherDemoFor(firmId, clientId);
  }, [firmId, clientId]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [batchOpen, setBatchOpen] = useState(false);

  const documentsById = useMemo(
    () => new Map(store.documents.map((d) => [d.id, d] as const)),
    [store.documents],
  );

  const clientEntries = useMemo(
    () => store.entries.filter((e) => e.client_id === clientId),
    [store.entries, clientId],
  );

  const lineSumsByEntry = useMemo(() => {
    const ids = new Set(clientEntries.map((e) => e.id));
    return buildLineSumsMap(store.lines.filter((l) => ids.has(l.journal_entry_id)));
  }, [clientEntries, store.lines]);

  const { counts, filtered } = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: clientEntries.length,
      draft: 0,
      posted: 0,
      reversed: 0,
    };
    const kw = keyword.trim();
    const list: JournalEntry[] = [];
    for (const e of clientEntries) {
      c[e.status] += 1;
      if (statusFilter !== "all" && e.status !== statusFilter) continue;
      if (dateFrom && e.entry_date < dateFrom) continue;
      if (dateTo && e.entry_date > dateTo) continue;
      if (docTypeFilter !== "all") {
        if (docTypeFilter === "system") {
          if (e.document_id != null) continue;
        } else {
          const doc = e.document_id ? documentsById.get(e.document_id) : null;
          if (doc?.doc_type !== docTypeFilter) continue;
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
      return b.created_at.getTime() - a.created_at.getTime();
    });
    return { counts: c, filtered: list };
  }, [clientEntries, statusFilter, dateFrom, dateTo, docTypeFilter, keyword, documentsById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const visibleDraftIds = useMemo(
    () => pageRows.filter((e) => e.status === "draft").map((e) => e.id),
    [pageRows],
  );
  const allSelected =
    visibleDraftIds.length > 0 && visibleDraftIds.every((id) => selected.has(id));
  const someSelected = visibleDraftIds.some((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleDraftIds) next.delete(id);
      } else {
        for (const id of visibleDraftIds) next.add(id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setDocTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setKeyword("");
    setPage(0);
  };

  const selectedEntries = useMemo(
    () => clientEntries.filter((e) => selected.has(e.id)),
    [clientEntries, selected],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">傳票管理</h1>
        <Badge variant="outline" className="text-sm">
          示範資料（Phase 2）
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="size-4" />
            篩選與批次操作
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
              {selected.size > 0 && (
                <span className="ml-2">・已選取 {selected.size} 筆</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                disabled={
                  statusFilter === "all" &&
                  docTypeFilter === "all" &&
                  !dateFrom &&
                  !dateTo &&
                  !keyword
                }
              >
                <X className="size-4 mr-1" />
                清除篩選
              </Button>
              <Button
                onClick={() => setBatchOpen(true)}
                disabled={selectedEntries.filter((e) => e.status === "draft").length === 0}
              >
                批次過帳（{selectedEntries.filter((e) => e.status === "draft").length}）
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="全選"
                  />
                </TableHead>
                <TableHead className="w-28">日期</TableHead>
                <TableHead className="w-36">傳票編號</TableHead>
                <TableHead className="w-20">類型</TableHead>
                <TableHead>摘要</TableHead>
                <TableHead className="w-36 text-right">借 / 貸</TableHead>
                <TableHead className="w-24">狀態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-base">
                    尚無符合條件的傳票
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((entry) => {
                  const sums = lineSumsByEntry.get(entry.id) ?? { debit: 0, credit: 0 };
                  return (
                    <TableRow
                      key={entry.id}
                      className={cn(
                        entry.status === "draft" && "bg-muted/30",
                        entry.status === "reversed" && "opacity-60",
                      )}
                    >
                      <TableCell>
                        {entry.status === "draft" ? (
                          <Checkbox
                            checked={selected.has(entry.id)}
                            onCheckedChange={() => toggleOne(entry.id)}
                            aria-label="選取"
                          />
                        ) : (
                          <span className="block w-4" />
                        )}
                      </TableCell>
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
                        <div className="line-clamp-2">
                          {entry.description ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-base">
                        {formatNTD(sums.debit)}
                        <span className="mx-1 text-muted-foreground">/</span>
                        {formatNTD(sums.credit)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge entry={entry} />
                      </TableCell>
                    </TableRow>
                  );
                })
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

      {batchOpen && (
        <VoucherBatchPostDialog
          entries={selectedEntries}
          open={batchOpen}
          onOpenChange={setBatchOpen}
          onPosted={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
