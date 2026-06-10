"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, FolderInput, Loader2 } from "lucide-react";
import { convertDocType, convertToOther } from "@/lib/services/document";
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
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type SubVatType = "invoice" | "allowance";

interface ReclassifyDocumentActionsProps {
  // The CTI parent id (documents.id) — the reclassify actions key on this, not the subtable id.
  documentId: string;
  docType: SubVatType;
  // Carried onto the new subtable when converting type; direction itself is unchanged.
  inOrOut: "in" | "out";
  // Set when the document can't be reclassified (locked period / confirmed / processing).
  // The message also surfaces as a tooltip on the disabled buttons.
  disabledReason?: string | null;
  // Called after a successful convert — the parent should close the dialog and refresh lists.
  onReclassified: () => void;
}

// Firm-side manual re-classification, surfaced inside the invoice/allowance review
// dialog because it acts on the subtable entity (PR-1b). Two actions:
//   - convert type: 發票 ↔ 折讓單 (carries direction + period, re-OCRs as the new type)
//   - move to 其他文件: drop the subtable, leave the period list
// Both discard the current extraction, so each is behind a confirm step.
export function ReclassifyDocumentActions({
  documentId,
  docType,
  inOrOut,
  disabledReason,
  onReclassified,
}: ReclassifyDocumentActionsProps) {
  const [pending, setPending] = useState<"convert" | "other" | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const disabled = !!disabledReason;
  const currentNoun = docType === "invoice" ? "發票" : "折讓單";
  const targetType: SubVatType = docType === "invoice" ? "allowance" : "invoice";
  const targetNoun = targetType === "invoice" ? "發票" : "折讓單";

  const runConvertType = async () => {
    setIsSaving(true);
    try {
      await convertDocType(documentId, { docType: targetType, inOrOut });
      toast.success(`已轉為${targetNoun}`);
      setPending(null);
      onReclassified();
    } catch (error) {
      console.error("Error converting document type:", error);
      toast.error(error instanceof Error ? error.message : "變更失敗");
    } finally {
      setIsSaving(false);
    }
  };

  const runConvertToOther = async () => {
    setIsSaving(true);
    try {
      await convertToOther(documentId);
      toast.success("已移為其他文件");
      setPending(null);
      onReclassified();
    } catch (error) {
      console.error("Error moving document to other:", error);
      toast.error(error instanceof Error ? error.message : "變更失敗");
    } finally {
      setIsSaving(false);
    }
  };

  const buttons = (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground shrink-0">重新分類</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setPending("convert")}
      >
        <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
        轉為{targetNoun}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setPending("other")}
      >
        <FolderInput className="mr-1.5 h-3.5 w-3.5" />
        移為其他文件
      </Button>
    </div>
  );

  return (
    <>
      {disabled ? (
        <TooltipProvider>
          <Tooltip delayDuration={0}>
            {/* Disabled buttons don't emit hover events, so anchor the tooltip on a wrapper. */}
            <TooltipTrigger asChild>
              <div className="w-fit">{buttons}</div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{disabledReason}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        buttons
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && !isSaving && setPending(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === "convert" ? `轉為${targetNoun}？` : "移為其他文件？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending === "convert"
                ? `此${currentNoun}將改為${targetNoun}，原本辨識的內容會清除，需重新執行 AI 提取。已歸屬的期別與進銷項會保留。`
                : `此${currentNoun}將移出本期申報列表，歸入「其他文件」，原本辨識的內容會清除。可日後再重新歸類。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>
              {pending === "convert" ? `維持${currentNoun}` : "留在申報列表"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pending === "convert") runConvertType();
                else runConvertToOther();
              }}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pending === "convert" ? `轉為${targetNoun}` : "移為其他文件"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
