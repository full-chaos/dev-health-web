import { SkeletonLine, SkeletonChart } from "@/components/ui/Skeleton";

export default function Loading() {
    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="space-y-6">
            <SkeletonLine width="w-48" height="h-8" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SkeletonChart />
                <SkeletonChart />
            </div>
        </div>
    );
}
