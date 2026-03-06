"use client";

import { Loader2, Trash2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { PreAiQueueItem } from "@/hooks/use-pre-ai-upload-queue";

type UploadQueueListProps = {
  title?: string;
  items: PreAiQueueItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  pageSize: number;
  onLoadMore: () => void;
  onDelete?: (item: Pick<PreAiQueueItem, "id" | "filename">) => void;
};

const formatStatusLabel = (status: PreAiQueueItem["status"]) =>
  status === "uploaded" ? "待辨識" : "辨識中";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export function UploadQueueList({
  title = "已上傳檔案",
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  pageSize,
  onLoadMore,
  onDelete,
}: UploadQueueListProps) {
  if (isLoading && items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">目前沒有待辨識檔案。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-3 md:overflow-visible lg:grid-cols-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="w-44 shrink-0 rounded-md border bg-muted/20 p-2 text-xs md:w-auto md:shrink"
              title={item.filename}
            >
              <div className="mb-2 flex h-24 w-full items-center justify-center overflow-hidden rounded border bg-background">
                {item.previewUrl ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="h-full w-full cursor-zoom-in"
                        aria-label={`查看 ${item.filename} 大圖`}
                      >
                        <Image
                          src={item.previewUrl}
                          alt={item.filename}
                          className="h-full w-full object-cover"
                          width={192}
                          height={96}
                          loading="lazy"
                          unoptimized
                        />
                      </button>
                    </DialogTrigger>
                    <DialogContent className="w-[95vw] max-w-3xl p-3 sm:p-4">
                      <DialogTitle className="truncate text-sm sm:text-base">
                        {item.filename}
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        點擊縮圖可放大預覽
                      </DialogDescription>
                      <div className="relative mt-1 h-[70vh] w-full overflow-hidden rounded-md border bg-background">
                        <Image
                          src={item.previewUrl}
                          alt={item.filename}
                          className="h-full w-full object-contain"
                          width={1200}
                          height={900}
                          unoptimized
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    PDF / 檔案
                  </span>
                )}
              </div>
              <div className="space-y-1">
                <p className="truncate font-medium">{item.filename}</p>
                <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <Badge variant="secondary" className="text-[10px]">
                    {formatStatusLabel(item.status)}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </span>
                </div>
                {onDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-7 px-2 text-destructive hover:text-destructive"
                    onClick={() =>
                      onDelete({ id: item.id, filename: item.filename })
                    }
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    刪除
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        {hasMore ? (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  載入中
                </>
              ) : (
                `載入更多（每次 ${pageSize} 筆）`
              )}
            </Button>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            已載入全部待辨識檔案
          </p>
        )}
      </CardContent>
    </Card>
  );
}
