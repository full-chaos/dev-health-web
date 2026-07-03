import { SkeletonLine, SkeletonCard, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
    return (
        <div className="space-y-8">
            <SkeletonLine width="w-64" height="h-8" />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={4} />
            <SkeletonTable rows={6} cols={10} />
        </div>
    );
}
