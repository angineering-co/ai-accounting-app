"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Shared loading / error / empty scaffold for the voucher-detail and report pages:
// a back-button header plus a bordered message box. SWR has loading AND error
// states the synchronous demo store never had, so every read page needs all three.
export function RecordStateCard({
  title,
  message,
  tone = "muted",
}: {
  title: React.ReactNode;
  message: string;
  tone?: "muted" | "error";
}) {
  const router = useRouter();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      </div>
      <div
        className={cn(
          "rounded-md border border-dashed p-12 text-center text-base",
          tone === "error"
            ? "border-destructive/50 text-destructive"
            : "text-muted-foreground",
        )}
      >
        {message}
      </div>
    </div>
  );
}
