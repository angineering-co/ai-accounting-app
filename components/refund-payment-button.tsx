"use client";

import { useEffect, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { refundPayment } from "@/lib/services/payment-link";
import {
  isAutoCaptureBlackout,
  AUTO_CAPTURE_BLACKOUT_LABEL,
} from "@/lib/services/ecpay/auto-capture-window";
import { formatNTD } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * 對某筆已付款訂單發起全額退款。退款透過綠界 DoAction 即時執行，成功後狀態轉「已退款」。
 * 此動作不可復原，故以 AlertDialog 二次確認。
 */
export function RefundPaymentButton({
  firmId,
  paymentId,
  amount,
  description,
}: {
  firmId: string;
  paymentId: string;
  amount: number;
  description: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // 自動關帳時段（台灣 20:15–20:30）綠界禁止退款；此時段停用按鈕（伺服器端亦會擋）。
  // 初次 render 一律 false（避免 SSR/CSR 不一致），掛載後再依台灣時間每分鐘校正。
  const [blackout, setBlackout] = useState(false);
  useEffect(() => {
    const check = () => setBlackout(isAutoCaptureBlackout());
    check();
    const timer = setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, []);

  const onConfirm = async () => {
    setPending(true);
    try {
      // refundPayment 以「回傳值」傳遞預期內的退款失敗訊息：Server Action 直接 throw 的
      // 訊息在正式環境會被 Next.js 抹除成通用錯誤，回傳值則原樣保留。
      const result = await refundPayment({ firm_id: firmId, payment_id: paymentId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`已退款 NT$${formatNTD(amount)}`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      // 走到這裡代表非預期錯誤（網路中斷、未授權等），訊息可能已被抹除，給通用提示。
      toast.error(error instanceof Error ? error.message : "退款失敗，請稍後再試");
    } finally {
      setPending(false);
    }
  };

  if (blackout) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title={`綠界自動關帳時段（${AUTO_CAPTURE_BLACKOUT_LABEL}）暫停退款`}
      >
        <Undo2 className="mr-1 size-4" />
        退款
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Undo2 className="mr-1 size-4" />
          退款
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確認退款 NT${formatNTD(amount)}？</AlertDialogTitle>
          <AlertDialogDescription>
            將透過綠界對「{description}」退還全額 NT${formatNTD(amount)} 給客戶。
            退款無法復原，請確認金額無誤。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>不退款，維持已付款</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
            disabled={pending}
            className="bg-red-600 hover:bg-red-700 focus-visible:ring-red-600"
          >
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            確認退款
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
