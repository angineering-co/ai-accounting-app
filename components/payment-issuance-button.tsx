"use client";

import { useState } from "react";
import { FileText, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  markPaymentIssued,
  clearPaymentIssuance,
} from "@/lib/services/payment-link";
import {
  PAYMENT_DOC_KINDS,
  PAYMENT_DOC_KIND_LABELS,
  type PaymentDocKind,
  type PaymentIssuance,
} from "@/lib/domain/models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ResponsiveDialogContent } from "@/components/ui/responsive-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// 連結碼：寫在 Amego 訂單編號上，未來自動化時沿用。英數字、去除易混淆字元（0/O/1/I/L 等）。
function generateOrderId(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return `SB${code}`;
}

/**
 * 標記某筆已付款收款的開立狀態（發票 / 收據 / 免開立）。純追蹤 metadata：
 * 憑證仍於 Amego 手動開立，連結碼（order_id）建議填入 Amego 的訂單編號以利日後對帳。
 */
export function PaymentIssuanceButton({
  firmId,
  paymentId,
  description,
  issuance,
}: {
  firmId: string;
  paymentId: string;
  description: string;
  issuance: PaymentIssuance | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const [kind, setKind] = useState<PaymentDocKind>(issuance?.kind ?? "invoice");
  const [orderId, setOrderId] = useState(
    issuance?.order_id ?? generateOrderId(),
  );
  const [number, setNumber] = useState(issuance?.number ?? "");

  const resetFromIssuance = () => {
    setKind(issuance?.kind ?? "invoice");
    setOrderId(issuance?.order_id ?? generateOrderId());
    setNumber(issuance?.number ?? "");
  };

  const onSave = async () => {
    if (kind === "invoice" && !number.trim()) {
      toast.error("請填寫發票號碼");
      return;
    }
    setPending(true);
    try {
      await markPaymentIssued({
        firm_id: firmId,
        payment_id: paymentId,
        kind,
        order_id: kind === "none" ? undefined : orderId.trim() || undefined,
        number: kind === "none" ? undefined : number.trim() || undefined,
      });
      toast.success(
        kind === "none"
          ? "已標記免開立"
          : `已標記開立${PAYMENT_DOC_KIND_LABELS[kind]}`,
      );
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "標記失敗");
    } finally {
      setPending(false);
    }
  };

  const onClear = async () => {
    setPending(true);
    try {
      await clearPaymentIssuance({ firm_id: firmId, payment_id: paymentId });
      toast.success("已清除，回到待開立");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "清除失敗");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) resetFromIssuance();
      }}
    >
      <DialogTrigger asChild>
        {issuance ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-2 py-1 font-normal"
          >
            <span className="text-base">
              {PAYMENT_DOC_KIND_LABELS[issuance.kind]}
              {issuance.number ? (
                <span className="ml-1 tabular-nums text-muted-foreground">
                  {issuance.number}
                </span>
              ) : null}
            </span>
            <Pencil className="ml-1 size-3.5 text-muted-foreground" />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm">
            <FileText className="mr-1 size-4" />
            開立
          </Button>
        )}
      </DialogTrigger>
      <ResponsiveDialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>記錄開立</DialogTitle>
          <DialogDescription>
            「{description}」於 Amego 開立後，回此記錄。連結碼請填入 Amego 的訂單編號，便於日後對帳。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>類型</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as PaymentDocKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_DOC_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PAYMENT_DOC_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind !== "none" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="issuance-order-id">
                  連結碼（填入 Amego 訂單編號）
                </Label>
                <Input
                  id="issuance-order-id"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="SB7K3M9QH2"
                />
                <p className="text-sm text-muted-foreground">
                  系統已產生一組；可直接使用或改成你的編號。
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="issuance-number">
                  {kind === "invoice" ? "發票號碼" : "收據編號（選填）"}
                </Label>
                <Input
                  id="issuance-number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder={kind === "invoice" ? "AB12345678" : ""}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {issuance ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void onClear()}
              disabled={pending}
              className="text-muted-foreground"
            >
              清除（回到待開立）
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" onClick={() => void onSave()} disabled={pending}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            儲存
          </Button>
        </DialogFooter>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
