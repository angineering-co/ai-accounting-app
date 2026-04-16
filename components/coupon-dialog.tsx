"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, TicketPercent } from "lucide-react";
import { toast } from "sonner";

import { getCouponCode } from "@/lib/coupon-codes";
import {
  trackCouponCopy,
  trackCouponGeneration,
  trackCouponLineClick,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LINE_URL } from "@/lib/pricing";

export function CouponDialog({
  trigger,
  location,
}: {
  trigger: React.ReactNode;
  location: string;
}) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const trackedCodeRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleOpenChange(open: boolean) {
    if (open) {
      const c = getCouponCode();
      setCode(c);
      if (trackedCodeRef.current !== c) {
        trackedCodeRef.current = c;
        trackCouponGeneration(location, c);
      }
    }
  }

  function handleCopy() {
    if (!navigator.clipboard) {
      toast.error("您的瀏覽器不支援自動複製，請手動複製");
      return;
    }
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        toast.success("優惠碼已複製");
        trackCouponCopy(location, code);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {
        toast.error("複製失敗，請手動複製");
      },
    );
  }

  function handleLineClick() {
    trackCouponLineClick(location, code);
  }

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <TicketPercent className="h-5 w-5 text-amber-600" />
            設立登記優惠 NT$1,000
          </DialogTitle>
          <DialogDescription>
            加入 SnapBooks Line 好友，享設立登記折抵 NT$1,000。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/60 px-5 py-4">
          <span className="font-mono text-xl font-bold tracking-widest text-amber-900">
            {code}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="複製優惠碼"
            className="shrink-0 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-5 w-5" />
            ) : (
              <Copy className="h-5 w-5" />
            )}
          </Button>
        </div>

        <ol className="space-y-2 text-sm leading-relaxed text-slate-600">
          <li className="flex gap-2">
            <span className="font-semibold text-slate-800">1.</span>
            複製上方優惠碼
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-slate-800">2.</span>
            點擊下方按鈕加入 Line 好友
          </li>
          <li className="flex gap-2">
            <span className="font-semibold text-slate-800">3.</span>
            傳送優惠碼給我們，即可折抵設立登記費用 NT$1,000
          </li>
        </ol>

        <a
          href={LINE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLineClick}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#06C755] px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-[#05b54c]"
        >
          加入 Line 好友
          <ExternalLink className="h-4 w-4" />
        </a>

        <p className="text-center text-xs text-slate-400">
          本優惠適用於設立登記加購服務，每間公司限用一次，優惠碼於一個月內有效。
        </p>
      </DialogContent>
    </Dialog>
  );
}
