"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** 複製收款連結到剪貼簿，附短暫的「已複製」回饋。 */
export function CopyLinkButton({
  url,
  label = "複製連結",
}: {
  url: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("已複製收款連結");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("複製失敗，請手動選取連結複製");
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={onCopy}>
      {copied ? (
        <Check className="mr-1 size-4" />
      ) : (
        <Copy className="mr-1 size-4" />
      )}
      {label}
    </Button>
  );
}
