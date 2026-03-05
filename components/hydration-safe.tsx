"use client";

import * as React from "react";

type HydrationSafeProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function HydrationSafe({
  children,
  fallback = null,
}: HydrationSafeProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
