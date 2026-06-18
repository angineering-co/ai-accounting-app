"use client";

import { useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { refundPayment } from "@/lib/services/payment-link";
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

  const onConfirm = async () => {
    setPending(true);
    try {
      await refundPayment({ firm_id: firmId, payment_id: paymentId });
      toast.success(`已退款 NT$${formatNTD(amount)}`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "退款失敗");
    } finally {
      setPending(false);
    }
  };

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
