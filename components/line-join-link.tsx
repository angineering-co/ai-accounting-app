"use client";

import { LINE_URL } from "@/lib/pricing";
import { trackLineJoinClick, type LineJoinLocation } from "@/lib/analytics";

// Canonical anchor for any link that opens our LINE OA: owns LINE_URL, the
// target/rel attributes, and the line_join_click conversion event in one place.
// Use this everywhere (Server and Client Components alike). Forwards standard
// anchor attributes (aria-label, id, style, onClick, ...); a passed onClick
// fires alongside the conversion event.
export function LineJoinLink({
  location,
  children,
  onClick,
  ...props
}: {
  location: LineJoinLocation;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<"a">, "href" | "target" | "rel">) {
  return (
    <a
      {...props}
      href={LINE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        trackLineJoinClick(location);
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}
