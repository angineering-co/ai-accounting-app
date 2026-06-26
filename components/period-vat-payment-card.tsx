"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { format } from "date-fns";
import {
  CalendarIcon,
  CheckCircle2,
  Loader2,
  Pencil,
  Receipt,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatNTD } from "@/lib/utils";
import { accountLabel } from "@/lib/data/accounts";
import {
  deleteVatPaymentDraftAction,
  getVatPaymentInfoAction,
  recordVatPaymentAction,
} from "@/lib/services/vat-payment";

// 銀行存款 first (the default — most VAT is paid by ATM / bank transfer), 現金 second.
const CREDIT_ACCOUNTS = ["1112", "1111"] as const;

interface PeriodVatPaymentCardProps {
  periodId: string;
  firmId: string;
  clientId: string;
}

export function PeriodVatPaymentCard({
  periodId,
  firmId,
  clientId,
}: PeriodVatPaymentCardProps) {
  const { data, mutate, isLoading } = useSWR(
    ["vat-payment-info", periodId],
    () => getVatPaymentInfoAction(periodId),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [entryDate, setEntryDate] = useState("");
  const [amount, setAmount] = useState("");
  const [creditAccount, setCreditAccount] =
    useState<(typeof CREDIT_ACCOUNTS)[number]>("1112");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Nothing to render until loaded; hidden entirely for 留抵 / dormant periods
  // (nothing owed and nothing recorded).
  if (isLoading || !data) return null;
  const { payable, payment } = data;
  if (payable === 0 && !payment) return null;

  const isPosted = payment?.status === "posted";
  const isDraft = payment?.status === "draft";

  const openDialog = () => {
    setEntryDate(format(new Date(), "yyyy-MM-dd"));
    setAmount(String(payment?.amount ?? payable));
    setCreditAccount(
      (payment?.account_code as (typeof CREDIT_ACCOUNTS)[number]) ?? "1112",
    );
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) {
      toast.error("金額必須為大於 0 的整數");
      return;
    }
    setSubmitting(true);
    try {
      await recordVatPaymentAction(periodId, {
        entryDate,
        amount: amt,
        creditAccountCode: creditAccount,
      });
      toast.success(payment ? "已更新繳款分錄" : "已記錄繳款，請至傳票頁過帳");
      setDialogOpen(false);
      await mutate();
    } catch (error) {
      toast.error(
        "記錄失敗：" + (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteVatPaymentDraftAction(periodId);
      toast.success("已刪除繳款草稿");
      setConfirmDelete(false);
      await mutate();
    } catch (error) {
      toast.error(
        "刪除失敗：" + (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      setDeleting(false);
    }
  };

  const voucherHref = payment
    ? `/firm/${firmId}/client/${clientId}/voucher/${payment.id}`
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>營業稅繳款</CardTitle>
        <StatusPill status={payment?.status ?? null} voucherNo={payment?.voucher_no ?? null} />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          本期應繳營業稅{" "}
          <span className="font-mono text-base text-slate-900">
            {formatNTD(payable)}
          </span>
          。客戶完成繳款後，於此記錄繳款分錄（借 2132 應付稅捐 / 貸 銀行存款或現金），沖銷結算分錄所掛的應付稅捐。
        </p>

        {payment && (
          <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-700">
            <div className="flex justify-between">
              <span className="text-slate-500">繳款日期</span>
              <span className="font-mono text-slate-900">{payment.entry_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">金額</span>
              <span className="font-mono text-slate-900">{formatNTD(payment.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">付款方式</span>
              <span className="text-slate-900">{accountLabel(payment.account_code)}</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!payment && (
            <Button onClick={openDialog}>
              <Receipt className="mr-2 h-4 w-4" /> 記錄繳款
            </Button>
          )}
          {isDraft && (
            <>
              <Button variant="outline" onClick={openDialog}>
                <Pencil className="mr-2 h-4 w-4" /> 編輯
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" /> 刪除草稿
              </Button>
            </>
          )}
          {voucherHref && (
            <Button variant={isPosted ? "outline" : "ghost"} asChild>
              <Link href={voucherHref}>查看傳票</Link>
            </Button>
          )}
        </div>

        {isDraft && (
          <p className="text-sm text-slate-500">
            繳款分錄為草稿，請至傳票頁過帳後才會進入帳本。
          </p>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{payment ? "編輯繳款分錄" : "記錄營業稅繳款"}</DialogTitle>
            <DialogDescription>
              借 2132 應付稅捐 / 貸 {accountLabel(creditAccount)}，金額相同。儲存後為草稿，需另行過帳。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>繳款日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !entryDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {entryDate || "選擇日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={entryDate ? new Date(entryDate) : undefined}
                    onSelect={(d) => d && setEntryDate(format(d, "yyyy-MM-dd"))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vat-payment-amount">金額</Label>
              <Input
                id="vat-payment-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-right font-mono"
              />
              <p className="text-sm text-slate-500">
                預設為本期應繳 {formatNTD(payable)}，可調整（如含滯納金或分次繳納）。
              </p>
            </div>

            <div className="space-y-2">
              <Label>付款方式</Label>
              <Select
                value={creditAccount}
                onValueChange={(v) =>
                  setCreditAccount(v as (typeof CREDIT_ACCOUNTS)[number])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CREDIT_ACCOUNTS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {accountLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {payment ? "更新" : "記錄繳款"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除繳款草稿？</AlertDialogTitle>
            <AlertDialogDescription>
              將移除本期尚未過帳的繳款分錄。本期應繳金額不受影響，之後仍可重新記錄。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>保留草稿</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              刪除草稿
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function StatusPill({
  status,
  voucherNo,
}: {
  status: "draft" | "posted" | "reversed" | null;
  voucherNo: string | null;
}) {
  if (status === "posted") {
    return (
      <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-base text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        已繳款{voucherNo ? ` · ${voucherNo}` : ""}
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-base text-amber-700">
        已記錄 · 待過帳
      </span>
    );
  }
  return (
    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-base text-slate-600">
      未繳
    </span>
  );
}
