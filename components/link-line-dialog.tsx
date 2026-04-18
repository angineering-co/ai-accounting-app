"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { generateBindingCode } from "@/lib/services/line";
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

interface LinkLineDialogProps {
  clientId: string;
}

export function LinkLineDialog({ clientId }: LinkLineDialogProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setCode(null);
      setCopied(false);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await generateBindingCode(clientId);
      if (result.success && result.bindingCode) {
        setCode(result.bindingCode);
      } else {
        toast.error(result.error || "產生綁定碼失敗");
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "產生綁定碼失敗");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!code) return;
    if (!navigator.clipboard) {
      toast.error("您的瀏覽器不支援自動複製，請手動複製");
      return;
    }
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        toast.success("綁定碼已複製");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {
        toast.error("複製失敗，請手動複製");
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageCircle className="mr-2 h-4 w-4" />
          連結 LINE
        </Button>
      </DialogTrigger>
      <ResponsiveDialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>連結 LINE 通知</DialogTitle>
          <DialogDescription>
            產生綁定碼並傳送給客戶，客戶將此碼傳送至您的 LINE 官方帳號即可完成連結。
          </DialogDescription>
        </DialogHeader>

        {code ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 px-5 py-4">
              <span className="font-mono text-xl font-bold tracking-widest text-emerald-900">
                {code}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="複製綁定碼"
                className="shrink-0 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-900"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Copy className="h-5 w-5" />
                )}
              </Button>
            </div>

            <ol className="space-y-2 text-base leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">1.</span>
                複製上方綁定碼
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">2.</span>
                將綁定碼傳送給客戶
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-foreground">3.</span>
                客戶將綁定碼傳送至您的 LINE 官方帳號，並點選確認按鈕即可完成綁定
              </li>
            </ol>

            <p className="text-sm text-muted-foreground">
              此綁定碼於 48 小時後失效。
            </p>
          </div>
        ) : (
          <p className="py-2 text-base text-muted-foreground">
            點擊下方按鈕產生一組 48 小時內有效的綁定碼。
          </p>
        )}

        <DialogFooter>
          {code ? (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              關閉
            </Button>
          ) : (
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              產生綁定碼
            </Button>
          )}
        </DialogFooter>
      </ResponsiveDialogContent>
    </Dialog>
  );
}
