"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const MAX_REFRESHES = 5; // 約 12 秒（5 × 2.5s）
const REFRESH_DELAY_MS = 2500;

/**
 * 付款結果頁仍 pending 時短暫輪詢：ReturnURL（server-to-server）可能比消費者導回稍慢。
 *
 * 用 router.refresh()「軟重整」重抓 server component 的 status，**不會卸載本元件**，故計數
 * 以 useRef 留在記憶體即可——刻意不用 sessionStorage：Safari 無痕 / 嚴格 WebView 下
 * storage 會 throw，用它計數會失效並無限重整。狀態變 paid/failed 後父層不再渲染本元件、
 * 自然停止。到上限仍 pending 則顯示手動重整與聯繫提示，不讓客戶卡在「確認中…」。
 */
export function ResultAutoRefresh() {
  const router = useRouter();
  const refreshes = useRef(0);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (cancelled) return;
      if (refreshes.current >= MAX_REFRESHES) {
        setStalled(true);
        return;
      }
      refreshes.current += 1;
      router.refresh();
      timer = setTimeout(tick, REFRESH_DELAY_MS);
    };
    timer = setTimeout(tick, REFRESH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router]);

  if (!stalled) return null;

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-base text-muted-foreground">
        確認付款結果的時間較長。請稍候後重新整理本頁，若仍有疑問請與我們聯繫。
      </p>
      {/* 使用者主動觸發的單次硬重整：會重新掛載並重啟輪詢，不構成自動無限重整。 */}
      <Button variant="outline" onClick={() => window.location.reload()}>
        重新整理
      </Button>
    </div>
  );
}
