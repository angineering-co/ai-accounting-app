"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronRight, Minus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatDateTimeZhTW } from "@/lib/utils";
import { updateLeadStatus, type LeadRecord } from "@/lib/services/leads";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_COLORS,
  isLeadStatus,
} from "@/lib/domain/lead-status";

const PATH_LABELS: Record<string, string> = {
  registration: "設立 + 記帳",
  bookkeeping: "委託記帳",
};

const FIELD_LABELS: Record<string, string> = {
  contactName: "聯絡人",
  email: "電子信箱",
  phone: "電話",
  notes: "備註",
  companyType: "公司類型",
  companyNames: "公司名稱候選",
  businessDescription: "營業內容",
  capitalAmount: "資本額",
  shareholderCount: "股東人數",
  addressSituation: "登記地址狀況",
  articlesOfIncorporation: "章程需求",
  companyName: "公司名稱",
  taxId: "統一編號",
  currentAccounting: "目前記帳方式",
  monthlyInvoiceVolume: "每月發票量",
};

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    const items = value.filter((v) => v !== "" && v != null);
    return items.length === 0 ? "—" : items.join("、");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function LeadsTable({ leads }: { leads: LeadRecord[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Optimistic per-lead status overrides, applied instantly on change and
  // reconciled from the server once the action resolves.
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, string>
  >({});

  // Once the refreshed server data matches an optimistic override, drop it so
  // a stale override can never permanently mask a newer server status (e.g. a
  // change another admin made). React supports this "adjust state during
  // render" pattern — it converges because the next render finds no match.
  const reconciledIds = leads
    .filter((l) => l.id in statusOverrides && statusOverrides[l.id] === l.status)
    .map((l) => l.id);
  if (reconciledIds.length > 0) {
    setStatusOverrides((prev) => {
      const next = { ...prev };
      for (const id of reconciledIds) delete next[id];
      return next;
    });
  }

  if (leads.length === 0) {
    return (
      <p className="text-base text-muted-foreground">目前沒有申請名單。</p>
    );
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStatusChange = (
    leadId: string,
    previousStatus: string,
    nextStatus: string,
  ) => {
    if (nextStatus === previousStatus) return;
    setStatusOverrides((prev) => ({ ...prev, [leadId]: nextStatus }));
    startTransition(async () => {
      const result = await updateLeadStatus(leadId, nextStatus);
      if (!result.ok) {
        // Drop the optimistic value (falls back to the unchanged server
        // status) and tell the user.
        setStatusOverrides((prev) => {
          const next = { ...prev };
          delete next[leadId];
          return next;
        });
        toast.error(result.error ?? "更新失敗，請稍後再試。");
        return;
      }
      // Re-sync the server component so the override can be dropped safely.
      router.refresh();
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>申請時間</TableHead>
          <TableHead>編號</TableHead>
          <TableHead>類型</TableHead>
          <TableHead>聯絡人</TableHead>
          <TableHead>電子信箱</TableHead>
          <TableHead>電話</TableHead>
          <TableHead className="text-center">加 LINE</TableHead>
          <TableHead>狀態</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.map((lead) => {
          const isOpen = expanded.has(lead.id);
          const data = lead.data;
          const contactName = (data.contactName as string) ?? "—";
          const email = (data.email as string) ?? "—";
          const phone = (data.phone as string) ?? "—";
          const pathLabel = PATH_LABELS[lead.path] ?? lead.path;
          const status = statusOverrides[lead.id] ?? lead.status;

          const dataEntries = Object.entries(data).filter(
            ([key]) => !["contactName", "email", "phone"].includes(key),
          );

          return (
            <Fragment key={lead.id}>
              <TableRow
                onClick={() => toggle(lead.id)}
                className="cursor-pointer"
              >
                <TableCell>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDateTimeZhTW(new Date(lead.created_at))}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {lead.lead_code}
                </TableCell>
                <TableCell>{pathLabel}</TableCell>
                <TableCell className="font-medium">{contactName}</TableCell>
                <TableCell className="text-sm">{email}</TableCell>
                <TableCell className="text-sm tabular-nums">{phone}</TableCell>
                <TableCell className="text-center">
                  {lead.has_line ? (
                    <Check
                      className="mx-auto h-4 w-4 text-emerald-600"
                      aria-label="已加入 LINE"
                    />
                  ) : (
                    <Minus
                      className="mx-auto h-4 w-4 text-muted-foreground"
                      aria-label="尚未加入 LINE"
                    />
                  )}
                </TableCell>
                <TableCell
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-default"
                >
                  <Select
                    value={status}
                    onValueChange={(next) =>
                      handleStatusChange(lead.id, status, next)
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-8 w-28 font-medium",
                        isLeadStatus(status) && LEAD_STATUS_COLORS[status],
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {LEAD_STATUS_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                  <TableCell />
                  <TableCell colSpan={8} className="py-3">
                    {dataEntries.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        無其他表單欄位。
                      </p>
                    ) : (
                      <dl
                        className={cn(
                          "grid gap-x-6 gap-y-2",
                          "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
                        )}
                      >
                        {dataEntries.map(([key, value]) => (
                          <div key={key} className="flex flex-col">
                            <dt className="text-sm text-muted-foreground">
                              {FIELD_LABELS[key] ?? key}
                            </dt>
                            <dd className="text-base whitespace-pre-wrap break-words">
                              {formatValue(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
