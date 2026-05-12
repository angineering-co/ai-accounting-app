"use client";

import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PeriodStatusBadge } from "@/components/period-status-badge";
import { cn, formatDateToYYYYMMDD } from "@/lib/utils";
import { type TaxFilingPeriod } from "@/lib/domain/models";
import {
  addFilingAttachments,
  getFilingAttachmentSignedUrl,
  getSnapshotSignedUrl,
  markPeriodAsFiled,
  removeFilingAttachment,
  unfilePeriod,
} from "@/lib/services/tax-period";

interface PeriodFilingCardProps {
  period: TaxFilingPeriod;
  onChanged: () => void;
}

function formatDateTime(value: Date | string | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDateToYYYYMMDD(d)} ${hh}:${mm}`;
}

async function runDownload(
  getUrl: () => Promise<string | null>,
): Promise<void> {
  try {
    const url = await getUrl();
    if (!url) {
      toast.error("無法取得下載連結");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (error) {
    toast.error(
      `下載失敗: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function PeriodFilingCard({
  period,
  onChanged,
}: PeriodFilingCardProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [isMarking, setIsMarking] = useState(false);
  const [isUnfileOpen, setIsUnfileOpen] = useState(false);
  const [isUnfiling, setIsUnfiling] = useState(false);

  const txt = period.filing.snapshots.txt;
  const tetU = period.filing.snapshots.tet_u;
  const attachments = period.filing.attachments;
  const isFiled = period.status === "filed";
  const hasBothSnapshots = !!txt && !!tetU;
  const canMarkAsFiled =
    hasBothSnapshots && attachments.length > 0 && !isFiled;

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsUploading(true);
      const formData = new FormData();
      for (const file of files) formData.append("file", file);
      try {
        await addFilingAttachments(period.id, formData);
        toast.success(`已上傳 ${files.length} 個附件`);
        onChanged();
      } catch (error) {
        toast.error(
          `上傳失敗: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setIsUploading(false);
      }
    },
    [period.id, onChanged],
  );

  const onDropAccepted = useCallback(
    (files: File[]) => {
      void handleUpload(files);
    },
    [handleUpload],
  );

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    for (const r of rejections) {
      const msg = r.errors.map((e) => e.message).join(", ");
      toast.error(`${r.file.name}: ${msg}`);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDropAccepted,
    onDropRejected,
    accept: { "application/pdf": [".pdf"] },
    multiple: true,
    noClick: true,
    disabled: isUploading,
  });

  const handleDownloadAttachment = (filename: string) =>
    runDownload(() => getFilingAttachmentSignedUrl(period.id, filename));

  const handleDownloadSnapshot = (kind: "txt" | "tet_u") =>
    runDownload(() => getSnapshotSignedUrl(period.id, kind));

  const handleRemove = async (filename: string) => {
    setPendingRemove(filename);
    try {
      await removeFilingAttachment(period.id, filename);
      toast.success("已移除附件");
      onChanged();
    } catch (error) {
      toast.error(
        `移除失敗: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setPendingRemove(null);
    }
  };

  const handleMarkAsFiled = async () => {
    setIsMarking(true);
    try {
      await markPeriodAsFiled(period.id);
      toast.success("已標記為已申報");
      onChanged();
    } catch (error) {
      toast.error(
        `標記失敗: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsMarking(false);
    }
  };

  const handleUnfile = async () => {
    setIsUnfiling(true);
    try {
      await unfilePeriod(period.id);
      toast.success("已取消申報，期別恢復為進行中");
      setIsUnfileOpen(false);
      onChanged();
    } catch (error) {
      toast.error(
        `取消失敗: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsUnfiling(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>申報結案</CardTitle>
        <FilingProgressPill
          period={period}
          hasBothSnapshots={hasBothSnapshots}
        />
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasBothSnapshots && (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-600">
            尚未產生完整申報檔，請於上方產生 .TXT 與 .TET_U 後再上傳國稅局收執聯。
          </p>
        )}

        <section className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900">申報檔快照</h3>
          <SnapshotRow
            label=".TXT 進銷項明細"
            snapshotPath={txt?.path}
            generatedAt={txt?.generated_at}
            onDownload={() => handleDownloadSnapshot("txt")}
          />
          <SnapshotRow
            label=".TET_U 申報書"
            snapshotPath={tetU?.path}
            generatedAt={tetU?.generated_at}
            onDownload={() => handleDownloadSnapshot("tet_u")}
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              國稅局申報附件
            </h3>
            <span className="text-sm text-slate-500">
              {attachments.length} 個檔案
            </span>
          </div>

          {attachments.length === 0 ? (
            <p className="text-sm text-slate-500">
              尚未上傳任何國稅局申報附件。
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {attachments.map((a) => (
                <li
                  key={a.filename}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate text-base text-slate-900">
                        {a.filename}
                      </p>
                      <p className="text-sm text-slate-500">
                        上傳於 {formatDateTime(a.uploaded_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadAttachment(a.filename)}
                    >
                      <Download className="mr-1 h-4 w-4" /> 下載
                    </Button>
                    {!isFiled && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`移除 ${a.filename}`}
                        disabled={pendingRemove === a.filename}
                        onClick={() => handleRemove(a.filename)}
                        className="text-slate-500 hover:text-destructive"
                      >
                        {pendingRemove === a.filename ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!isFiled && (
            <div
              {...getRootProps()}
              className={cn(
                "rounded-md border-2 border-dashed border-slate-300 bg-slate-50/60 p-6 text-center transition-colors",
                isDragActive && "border-primary bg-primary/5",
                (isFiled || isUploading) && "opacity-60",
              )}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-5 w-5 text-slate-400" />
                <p className="text-base text-slate-700">
                  上傳國稅局申報附件 (PDF)
                </p>
                <p className="text-sm text-slate-500">
                  可拖放至此或
                  <button
                    type="button"
                    onClick={open}
                    className="ml-1 text-primary underline-offset-4 hover:underline"
                  >
                    選擇檔案
                  </button>
                  。同名檔案會覆蓋既有附件。
                </p>
                {isUploading && (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    上傳中...
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {isFiled ? (
            <>
              <span className="mr-auto text-sm text-slate-500">
                申報時間 {formatDateTime(period.filing.filed_at)}
              </span>
              <Button
                variant="ghost"
                onClick={() => setIsUnfileOpen(true)}
                disabled={isUnfiling}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                取消申報
              </Button>
            </>
          ) : (
            <Button
              onClick={handleMarkAsFiled}
              disabled={!canMarkAsFiled || isMarking}
            >
              {isMarking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              標記為已申報
            </Button>
          )}
        </section>
      </CardContent>

      <AlertDialog open={isUnfileOpen} onOpenChange={setIsUnfileOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>取消申報？</AlertDialogTitle>
            <AlertDialogDescription>
              將此期別恢復為「進行中」，已上傳的快照與附件會保留。
              如果只是要下載附件，不需要取消申報。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUnfiling}>
              保持已申報狀態
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleUnfile();
              }}
              disabled={isUnfiling}
            >
              {isUnfiling ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              取消申報
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const PROGRESS_STYLES = {
  missing: "border-slate-200 bg-slate-50 text-slate-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
} as const;

function FilingProgressPill({
  period,
  hasBothSnapshots,
}: {
  period: TaxFilingPeriod;
  hasBothSnapshots: boolean;
}) {
  if (period.status === "filed") {
    return <PeriodStatusBadge period={period} showFiledDate />;
  }
  const key = hasBothSnapshots ? "pending" : "missing";
  const label = hasBothSnapshots ? "待申報" : "尚未產生";
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1 text-base",
        PROGRESS_STYLES[key],
      )}
    >
      {label}
    </span>
  );
}

function SnapshotRow({
  label,
  snapshotPath,
  generatedAt,
  onDownload,
}: {
  label: string;
  snapshotPath: string | undefined;
  generatedAt: Date | string | undefined;
  onDownload: () => void;
}) {
  const hasSnapshot = !!snapshotPath;
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <p className="text-base text-slate-900">{label}</p>
          <p className="text-sm text-slate-500">
            {hasSnapshot
              ? `產生於 ${formatDateTime(generatedAt)}`
              : "尚未產生"}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDownload}
        disabled={!hasSnapshot}
      >
        <Download className="mr-1 h-4 w-4" /> 下載
      </Button>
    </div>
  );
}
