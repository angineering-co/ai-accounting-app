"use client";

import { useEffect } from "react";

const MAX_RELOADS = 4; // 約 10 秒內輪詢 4 次，避免 ReturnURL 遲未送達時無限重整
const RELOAD_DELAY_MS = 2500;

/**
 * 付款結果頁仍是 pending 時短暫輪詢：ReturnURL（server-to-server）可能比消費者
 * 導回稍慢。每 token 以 sessionStorage 計次，達上限即停。狀態變 paid/failed 後
 * 頁面不再渲染本元件，輪詢自然停止。
 */
export function ResultAutoRefresh({ token }: { token: string }) {
  useEffect(() => {
    const key = `ecpay-result-reload-${token}`;
    const count = Number(sessionStorage.getItem(key) ?? "0");
    if (count >= MAX_RELOADS) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem(key, String(count + 1));
      window.location.reload();
    }, RELOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [token]);

  return null;
}
