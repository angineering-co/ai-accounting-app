"use client";

import { DialogContent as BaseDialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import * as React from "react";

/**
 * ResponsiveDialogContent
 *
 * Custom wrapper around the base DialogContent from shadcn/ui.
 *
 * Why this exists:
 * - Decouples our app-level dialogs from the underlying shadcn DialogContent so
 *   we can change or replace the base implementation without touching every dialog.
 * - Applies a consistent responsive layout contract used across the app:
 *   - Constrains content height to the viewport (`max-h-[90vh]` by default)
 *   - Uses a column flex layout so dialog body can scroll while the footer remains visible
 *   - Hides overflow at the content root; inner sections decide what scrolls
 *   - Disables Radix's default auto-focus behavior by default so inputs don't
 *     steal focus on open; this can be overridden per-call.
 *
 * Usage notes:
 * - Place scrollable areas inside the content (e.g. wrap your form body in a
 *   `div` with `flex-1 min-h-0 overflow-y-auto`) and keep footers outside that
 *   scroll region so action buttons remain visible on small viewports.
 * - To re-enable auto-focus for a specific dialog, pass `disableAutoFocus={false}`
 *   or provide a custom `onOpenAutoFocus` handler.
 */
type ResponsiveDialogContentProps = React.ComponentProps<
  typeof BaseDialogContent
> & {
  maxHeight?: string;
  /** When true (default), prevents Radix from auto-focusing the first element on open. */
  disableAutoFocus?: boolean;
};

export const ResponsiveDialogContent = React.forwardRef<
  React.ElementRef<typeof BaseDialogContent>,
  ResponsiveDialogContentProps
>(({ className, maxHeight = "90vh", disableAutoFocus = true, onOpenAutoFocus, ...props }, ref) => {
  return (
    <BaseDialogContent
      ref={ref}
      className={cn(
        // Ensure dialog never exceeds viewport height and use flex layout
        "overflow-hidden flex flex-col",
        className
      )}
      style={{ maxHeight }}
      onOpenAutoFocus={(event) => {
        if (disableAutoFocus) {
          event.preventDefault();
        }
        onOpenAutoFocus?.(event);
      }}
      {...props}
    />
  );
});

ResponsiveDialogContent.displayName = "ResponsiveDialogContent";
