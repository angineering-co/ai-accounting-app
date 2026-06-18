import { PayShell } from "./pay-shell";

/**
 * /pay/* 的品牌化 not-found 邊界。涵蓋未知 / 已失效 / 已被取消的 checkout_token
 * （checkout 與結果頁 notFound() 都會落到這裡），取代 Next 預設的英文 404。
 * 訊息刻意不下「失敗」結論：付款狀態以 ReturnURL 為準，與此頁無關。
 */
export default function PayNotFound() {
  return (
    <PayShell
      tone="error"
      title="找不到這筆收款"
      detail="這個連結可能已失效或被取消。若您剛完成付款，款項仍會正常入帳；如需新的連結或有任何疑問，請與我們聯繫。"
    />
  );
}
