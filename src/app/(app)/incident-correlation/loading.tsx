import { SkeletonLine, SkeletonChart } from "@/components/ui/Skeleton";

export default function Loading() {
    return (
        <div className="space-y-6 p-6">
            <SkeletonLine width="w-64" height="h-8" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SkeletonChart />
                <SkeletonChart />
                <SkeletonChart />
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <SkeletonChart />
                <SkeletonChart />
            </div>
        </div>
    );
}
