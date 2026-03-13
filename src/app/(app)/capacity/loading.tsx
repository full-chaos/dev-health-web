import { SkeletonLine, SkeletonCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <SkeletonLine width="w-48" height="h-8" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  );
}
