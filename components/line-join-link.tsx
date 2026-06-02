"use client";

import { LINE_URL } from "@/lib/pricing";
import { trackLineJoinClick, type LineJoinLocation } from "@/lib/analytics";

// Canonical anchor for any link that opens our LINE OA: owns LINE_URL, the
// target/rel attributes, and the line_join_click conversion event in one place.
// Use this everywhere (Server and Client Components alike). Pass `onClick` for
// any extra per-click tracking that should fire alongside the conversion.
export function LineJoinLink({
  location,
  className,
  children,
  ariaLabel,
  onClick,
}: {
  location: LineJoinLocation;
  className?: string;
  children: React.ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
}) {
  return (
    <a
      href={LINE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={className}
      onClick={() => {
        trackLineJoinClick(location);
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}
