import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";

export type TestOpsTabId = "overview" | "pipelines" | "tests" | "coverage";

type TestOpsTabsProps = {
    activeId: TestOpsTabId;
    filters: MetricFilter;
    role?: string;
};

const tabs = [
    { id: "overview", label: "Overview", path: "/testops" },
    { id: "pipelines", label: "Pipelines", path: "/testops/pipelines" },
    { id: "tests", label: "Tests", path: "/testops/tests" },
    { id: "coverage", label: "Coverage", path: "/testops/coverage" },
] as const;

export function TestOpsTabs({ activeId, filters, role }: TestOpsTabsProps) {
    const items: ViewSetItem[] = tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        path: withFilterParam(tab.path, filters, role),
        navVisible: true,
    }));

    return (
        <ViewSet orientation="tabs" items={items} activeId={activeId} ariaLabel="TestOps views" />
    );
}
