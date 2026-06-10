"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ChevronDown,
  FolderInput,
  Loader2,
} from "lucide-react";
import { convertDocType, convertToOther } from "@/lib/services/document";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  // Set when the document can't be reclassified (locked period / confirmed / processing /
  // unsaved edits). The message also surfaces as a tooltip on the disabled trigger.
  disabledReason?: string | null;
  // Called after a successful convert — the parent should close the dialog and refresh lists.
  onReclassified: () => void;
}

// Firm-side manual re-classification, surfaced as a 「重新分類」 menu in the
// invoice/allowance review dialog header (PR-1b). These are document-level
// (what kind of document this is) and deliberately separated from the form's
// field-level editing and 儲存/確認 footer. Two actions:
//   - convert type: 發票 ↔ 折讓單 (carries direction + period, re-OCRs as the new type)
//   - move to 其他文件: drop the subtable, leave the period list
// Both discard the current extraction, so each is behind a confirm step. The
// caller gates on unsaved edits (disable-while-dirty) so a convert never seeds
// the new subtable from stale persisted state.
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

  const trigger = (
    <Button type="button" variant="outline" size="sm" disabled={disabled}>
      重新分類
      <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
    </Button>
  );

  return (
    <>
      <DropdownMenu>
        {disabled ? (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              {/* Disabled triggers don't emit hover events, so anchor on a wrapper. */}
              <TooltipTrigger asChild>
                <span className="inline-flex">{trigger}</span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{disabledReason}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        )}
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setPending("convert")}>
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            轉為{targetNoun}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPending("other")}>
            <FolderInput className="mr-2 h-4 w-4" />
            移為其他文件
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
