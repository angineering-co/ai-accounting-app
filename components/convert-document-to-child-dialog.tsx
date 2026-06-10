"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import { convertDocToChild } from "@/lib/services/document";
import { RocPeriod } from "@/lib/domain/roc-period";
import type { DocumentRow } from "@/hooks/use-other-documents";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ConvertDocumentToChildDialogProps {
  document: DocumentRow | null;
  clientId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConverted?: () => void | Promise<void>;
}

type DocType = "invoice" | "allowance";
type InOrOut = "in" | "out";

// Firm-only: turn an `other` document into an invoice/allowance. The period is
// chosen manually (never auto-derived); on save the subtable is created and the
// document leaves the `/documents` list. OCR runs when staff press the period's
// 「AI 提取」action — conversion does not trigger it.
export function ConvertDocumentToChildDialog({
  document,
  clientId,
  isOpen,
  onOpenChange,
  onConverted,
}: ConvertDocumentToChildDialogProps) {
  const [docType, setDocType] = useState<DocType>("invoice");
  const [inOrOut, setInOrOut] = useState<InOrOut>("in");
  const [periodId, setPeriodId] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Reset the form each time the dialog opens on a document.
  useEffect(() => {
    if (isOpen) {
      setDocType("invoice");
      setInOrOut("in");
      setPeriodId("");
    }
  }, [isOpen]);

  const supabase = useMemo(() => createClient(), []);
  const { data: periods, isLoading } = useSWR(
    isOpen ? ["convert-doc-periods", clientId] : null,
    async () => {
      const { data, error } = await supabase
        .from("tax_filing_periods")
        .select("id, year_month, status")
        .eq("client_id", clientId)
        .order("year_month", { ascending: false });
      if (error) throw error;
      // Only periods that can still take documents.
      return (data ?? []).filter((p) => p.status === "open");
    },
  );

  const handleSave = async () => {
    if (!document || !periodId) return;
    setIsSaving(true);
    try {
      await convertDocToChild(document.id, {
        docType,
        inOrOut,
        taxFilingPeriodId: periodId,
      });
      toast.success(docType === "invoice" ? "已轉為發票" : "已轉為折讓");
      await onConverted?.();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("變更失敗");
    } finally {
      setIsSaving(false);
    }
  };

  const hasPeriods = (periods?.length ?? 0) > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>變更為發票 / 折讓</DialogTitle>
          <DialogDescription>
            把「{document?.filename ?? "其他文件"}」歸入申報期別。變更後會離開其他文件列表。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-base">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">類型</Label>
            <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice">發票（統一發票）</SelectItem>
                <SelectItem value="allowance">折讓（折讓證明單）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">進項 / 銷項</Label>
            <Select value={inOrOut} onValueChange={(v) => setInOrOut(v as InOrOut)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">進項</SelectItem>
                <SelectItem value="out">銷項</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">申報期別</Label>
            <Select
              value={periodId}
              onValueChange={setPeriodId}
              disabled={isLoading || !hasPeriods}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isLoading ? "載入中..." : hasPeriods ? "選擇期別" : "尚無可用期別"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(periods ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {RocPeriod.fromYYYMM(p.year_month).format()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isLoading && !hasPeriods && (
              <p className="text-sm text-muted-foreground">
                請先於期別頁建立申報期別，再回來變更此文件。
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={!periodId || isSaving}>
            變更
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
