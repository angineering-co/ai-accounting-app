import { Skeleton } from "@/components/ui/skeleton";

export default function PortalPeriodDetailLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Back button */}
      <Skeleton className="h-9 w-36 rounded-full" />

      {/* Header section */}
      <Skeleton className="h-32 w-full rounded-[28px]" />

      {/* Tab bar */}
      <Skeleton className="h-12 w-full rounded-2xl" />

      {/* Tab content (overview cards) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="hidden h-24 rounded-2xl sm:block" />
        <Skeleton className="hidden h-24 rounded-2xl xl:block" />
      </div>
    </div>
  );
}
