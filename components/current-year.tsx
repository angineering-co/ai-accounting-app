"use client";

import { useEffect, useState } from "react";

export function CurrentYear() {
  // SSR 預設回傳靜態年份，避免伺服器建置時執行 new Date()
  const [year, setYear] = useState<number | string>("2026");

  useEffect(() => {
    // 只在客戶端瀏覽器掛載後，才動態抓取當前年份
    setYear(new Date().getFullYear());
  }, []);

  return <span>{year}</span>;
}
