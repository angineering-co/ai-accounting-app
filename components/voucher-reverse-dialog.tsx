"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, AlertTriangle } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { JournalEntry } from "@/lib/domain/journal-entry";
import { useVoucherDemoStore } from "@/lib/dev/use-voucher-demo-store";

interface VoucherReverseDialogProps {
  entry: JournalEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoucherReverseDialog({
  entry,
  open,
  onOpenChange,
}: VoucherReverseDialogProps) {
  const store = useVoucherDemoStore();
  const router = useRouter();
  const { firmId, clientId } = useParams() as {
    firmId: string;
    clientId: string;
  };

  const [reason, setReason] = useState("");
  const [entryDate, setEntryDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  useEffect(() => {
    if (!open) {
      setReason("");
      setEntryDate(format(new Date(), "yyyy-MM-dd"));
    }
  }, [open]);

  const dateAsDate = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entryDate);
    if (!m) return undefined;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  })();

  const handleSubmit = () => {
    if (!reason.trim()) {
      toast.error("沖銷原因必填");
      return;
    }
    const newId = store.reverseEntry(entry.id, reason.trim(), store.userId, entryDate);
    if (!newId) {
      toast.error("無法沖銷（可能已被沖銷或不是 posted 狀態）");
      return;
    }
    toast.success("已建立反向分錄");
    onOpenChange(false);
    router.push(`/firm/${firmId}/client/${clientId}/voucher/${newId}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>沖銷此傳票</DialogTitle>
          <DialogDescription className="text-base">
            原傳票{" "}
            <span className="font-mono font-bold">{entry.voucher_no}</span>{" "}
            將標記為已沖銷；同時建立一筆反向分錄（借貸對調）於指定日期認列。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-base text-amber-900 flex gap-2 items-start">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium">何時用沖銷而非編輯？</div>
            <div className="text-sm mt-1">
              當業務上真的發生退貨 / 取消 / 廠商重開時用沖銷。
              若只是 OCR 或 key-in 抓錯，請改用「編輯」直接 in-place 修正
              （當年度未關帳前可用，會留下審計軌跡）。
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="reverse-date" className="text-base">
              反向分錄記帳日期
            </Label>
            <div className="mt-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="reverse-date"
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !entryDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {entryDate || "請選日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateAsDate}
                    onSelect={(d) => {
                      if (d) setEntryDate(format(d, "yyyy-MM-dd"));
                    }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              預設為今天；若要在其他日期認列沖銷可調整。年度已關帳的日期不允許。
            </p>
          </div>

          <div>
            <Label htmlFor="reverse-reason" className="text-base">
              沖銷原因 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="reverse-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例：客戶取消訂單，全額退回；或廠商發現開錯，已重開新發票"
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              將永久記錄在審計軌跡中。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            維持原狀
          </Button>
          <Button onClick={handleSubmit} variant="destructive">
            確認沖銷
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
