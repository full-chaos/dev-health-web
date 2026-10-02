import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";
import { getTabSet, tabHref, type TabIdOf } from "@/lib/navigation/tabs";

export type TestOpsTabId = TabIdOf<"testops">;

type TestOpsTabsProps = {
    activeId: TestOpsTabId;
    filters: MetricFilter;
    role?: string;
};

export function TestOpsTabs({ activeId, filters, role }: TestOpsTabsProps) {
    const set = getTabSet("testops");
    const items: ViewSetItem[] = set.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        path: withFilterParam(tabHref(set, tab.id), filters, role),
        navVisible: true,
    }));

    return (
        <ViewSet orientation="tabs" items={items} activeId={activeId} ariaLabel="TestOps views" />
    );
}
