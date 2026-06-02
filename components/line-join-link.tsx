"use client";

import { LINE_URL } from "@/lib/pricing";
import { trackLineJoinClick } from "@/lib/analytics";

// Anchor that opens our LINE OA and fires the line_join_click conversion event.
// Use this for LINE entry points rendered inside Server Components; Client
// Components can call trackLineJoinClick() directly on their own onClick.
export function LineJoinLink({
  location,
  className,
  children,
  ariaLabel,
}: {
  location: string;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <a
      href={LINE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={className}
      onClick={() => trackLineJoinClick(location)}
    >
      {children}
    </a>
  );
}
