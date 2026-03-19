"use client";

import { trackCtaClick } from "@/lib/analytics";

export function CtaLink({
  href,
  location,
  children,
  className,
}: {
  href: string;
  location: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={() => trackCtaClick(location)}
    >
      {children}
    </a>
  );
}
