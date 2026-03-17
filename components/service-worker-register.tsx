"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production.
 * Drop this component into the root layout — it renders nothing visible.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[SW] registration failed:", err);
      });
    }
  }, []);

  return null;
}
