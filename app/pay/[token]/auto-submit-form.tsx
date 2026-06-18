"use client";

import { useEffect, useRef } from "react";

/**
 * 把帶 CheckMacValue 的 AIO 參數組成隱藏表單並於載入後自動 POST 到綠界付款頁。
 * 值以原始字串放入 input（React 會做 HTML escaping），瀏覽器送出時自帶
 * application/x-www-form-urlencoded 編碼。無 JS 時提供按鈕讓使用者手動送出。
 */
export function AutoSubmitForm({
  actionUrl,
  params,
}: {
  actionUrl: string;
  params: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formRef.current?.submit();
  }, []);

  return (
    <form ref={formRef} method="post" action={actionUrl}>
      {Object.entries(params).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <noscript>
        <button type="submit" className="underline">
          前往綠界付款
        </button>
      </noscript>
    </form>
  );
}
