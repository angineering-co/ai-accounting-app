import { Skeleton } from "@/components/ui/skeleton";

export default function PortalDashboardLoading() {
  return (
    <div className="space-y-8 p-6">
      {/* Hero section skeleton */}
      <Skeleton className="h-44 w-full rounded-[28px]" />

      {/* Primary period section */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-36 w-full rounded-2xl" />
      </div>

      {/* Secondary periods */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-48" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="hidden h-28 rounded-2xl md:block" />
          <Skeleton className="hidden h-28 rounded-2xl lg:block" />
        </div>
      </div>
    </div>
  );
}
