import { SkeletonLine, SkeletonChart } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 p-6">
      <SkeletonLine width="w-48" height="h-8" />
      <SkeletonChart height="h-96" />
    </div>
  );
}
