"use client";

import Link from "next/link";
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
    <Link
      href={href}
      className={className}
      onClick={() => trackCtaClick(location)}
    >
      {children}
    </Link>
  );
}
