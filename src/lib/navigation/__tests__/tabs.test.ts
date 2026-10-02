import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getAreaById, isNavChildVisible } from "../areas";
import { CTA_LABELS } from "@/lib/design/cta";
import { METRIC_TABS } from "@/lib/metrics/metricTabs";

import { getAreaById as areaOf, selectedChildForPathname } from "../areas";
import {
    TAB_SETS,
    getTabSet,
    isTabVisible,
    routeTabForPathname,
    tabHref,
    type TabSet,
} from "../tabs";

// The sets as the general type: loops over every set do not depend on each set's literal type.
const SETS: readonly TabSet[] = TAB_SETS;

// The tab lists the two pages carried inline before the registry: the registry must say exactly this
// (same ids, same labels, same order). This is the pin that used to be the page source text.
const BEFORE = {
    complexity: [
        ["overview", "Overview"],
        ["flame", "Flame"],
        ["hotspots", "Hotspots"],
        ["ownership-risk", "Ownership Risk"],
        ["churn", "Churn"],
    ],
    "cognitive-load": [
        ["overview", "Overview"],
        ["heatmap", "Heatmap"],
        ["context-switching", "Context Switching"],
        ["focus-pressure", "Focus Pressure"],
        ["load-drivers", "Load Drivers"],
    ],
    landscape: [
        ["overview", "Overview"],
        ["teams", "Teams"],
        ["repos", "Repos"],
        ["ownership", "Ownership"],
        ["hotspots", "Hotspots"],
    ],
    investment: [
        ["overview", "Overview"],
        ["allocation", "Allocation"],
        ["evidence", "Evidence"],
        ["confidence", "Confidence"],
    ],
    metrics: [
        ["dora", "DORA"],
        ["flow", "Flow"],
        ["throughput", "Throughput"],
    ],
    "ai-governance-risk": [
        ["overview", "Overview"],
        ["test-gaps", "Test Gaps"],
        ["evidence", "Evidence"],
    ],
    testops: [
        ["overview", "Overview"],
        ["pipelines", "Pipelines"],
        ["tests", "Tests"],
        ["coverage", "Coverage"],
    ],
    "work-graph": [
        ["overview", "Overview"],
        ["dependencies", "Dependencies"],
        ["inflow-outflow", "Inflow-Outflow"],
        ["review-network", "Review Network"],
        ["artifacts", "Artifacts"],
    ],
} as const;

// AD-1 option A: the old admin sidebar (`AdminSidebar.tsx`, deleted) listed these 11 pages, with
// these entitlement keys. The tab rows hold the same routes and keys; two labels follow the design
// (MAPPING-CHAOS-7630 §3): "Dashboard" is the Organization "Overview", "Organization" is "Settings".
const ADMIN_SIDEBAR_BEFORE = [
    ["Dashboard", "/org/admin", undefined],
    ["Users", "/org/admin/users", undefined],
    ["Organization", "/org/admin/settings", undefined],
    ["Providers", "/org/admin/integrations", undefined],
    ["Sync Status", "/org/admin/sync", undefined],
    ["Teams", "/org/admin/teams", undefined],
    ["Identities", "/org/admin/identities", undefined],
    ["Audit Logs", "/org/admin/audit-logs", "audit_log"],
    ["IP Allowlist", "/org/admin/ip-allowlist", "ip_allowlist"],
    ["Data Retention", "/org/admin/retention", "custom_retention"],
    ["AI Setup", "/org/admin/ai", "byo_llm"],
] as const;
const ADMIN_RENAMED: Record<string, string> = { Dashboard: "Overview", Organization: "Settings" };

describe("tab registry", () => {
    it.each(Object.entries(BEFORE))(
        "holds the %s tabs exactly as the page listed them",
        (id, tabs) => {
            const set: TabSet = getTabSet(id as keyof typeof BEFORE);
            expect(set.tabs.map((tab) => [tab.id, tab.label])).toEqual(tabs);
        },
    );

    it("has unique set ids and unique tab ids per set, and a default tab that exists", () => {
        expect(new Set(SETS.map((s) => s.id)).size).toBe(SETS.length);
        for (const set of SETS) {
            const ids = set.tabs.map((t) => t.id);
            expect(new Set(ids).size, set.id).toBe(ids.length);
            expect(ids, set.id).toContain(set.defaultTabId);
        }
    });

    it("builds the default tab without a query value and the others with the parameter", () => {
        const set = getTabSet("complexity");
        expect(tabHref(set, "overview")).toBe("/complexity");
        expect(tabHref(set, "flame")).toBe("/complexity?tab=flame");
        expect(tabHref(set, "ownership-risk")).toBe("/complexity?tab=ownership-risk");
        expect(tabHref(getTabSet("cognitive-load"), "load-drivers")).toBe(
            "/cognitive-load?tab=load-drivers",
        );
        expect(tabHref(getTabSet("landscape"), "teams")).toBe("/landscape?tab=teams");
        expect(tabHref(getTabSet("investment"), "overview")).toBe("/investment");
        expect(tabHref(getTabSet("work-graph"), "inflow-outflow")).toBe(
            "/diagnose/work-graph?tab=inflow-outflow",
        );
        // Metrics always linked its default tab with the parameter; TestOps tabs are routes.
        expect(tabHref(getTabSet("metrics"), "dora")).toBe("/metrics?tab=dora");
        expect(tabHref(getTabSet("metrics"), "throughput")).toBe("/metrics?tab=throughput");
        // The Governance Risk subviews use `view`, not `tab`; the e2e spec pins the "Evidence" link name.
        expect(tabHref(getTabSet("ai-governance-risk"), "overview")).toBe("/ai/risk");
        expect(tabHref(getTabSet("ai-governance-risk"), "test-gaps")).toBe(
            "/ai/risk?view=test-gaps",
        );
        expect(tabHref(getTabSet("ai-governance-risk"), "evidence")).toBe("/ai/risk?view=evidence");
        expect(CTA_LABELS.evidence).toBe("Evidence");
        expect(tabHref(getTabSet("testops"), "overview")).toBe("/testops");
        expect(tabHref(getTabSet("testops"), "coverage")).toBe("/testops/coverage");
    });

    it("names a destination the sidebar lists: every set's destination path is a visible navAreas child", () => {
        for (const set of SETS) {
            const child = getAreaById(set.areaId)?.children.find(
                (c) => c.path === (set.childPath ?? set.basePath),
            );
            expect(child, set.id).toBeDefined();
            // A platform admin sees every destination; the platform sets' destinations need it.
            expect(isNavChildVisible(child!, {}, { isPlatformAdmin: true }), set.id).toBe(true);
            expect(isNavChildVisible(child!, {}), set.id).toBe(!set.id.startsWith("platform"));
        }
    });

    const PAGE_FILE = {
        complexity: "app/(app)/complexity/page.tsx",
        "cognitive-load": "app/(app)/cognitive-load/page.tsx",
        landscape: "app/(app)/landscape/page.tsx",
        investment: "app/(app)/investment/page.tsx",
        "work-graph": "app/(app)/diagnose/work-graph/buildTabs.ts",
        metrics: "app/(app)/metrics/page.tsx",
        "ai-governance-risk": "components/ai/AIGovernanceRiskTabs.tsx",
        testops: "app/(app)/testops/TestOpsTabs.tsx",
    } as const;

    it("route sets give every tab its own route, query sets give none", () => {
        for (const set of SETS) {
            for (const tab of set.tabs) {
                expect("path" in tab && Boolean(tab.path), `${set.id}/${tab.id}`).toBe(
                    set.param === "route",
                );
            }
        }
    });

    it("holds the Admin tab rows of the design, in its order", () => {
        expect(getTabSet("admin-organization").tabs.map((t) => t.label)).toEqual([
            "Overview",
            "Users",
            "Teams",
            "Identities",
            "Audit Logs",
            "IP Allowlist",
            "Data Retention",
            "AI Setup",
            "Settings",
        ]);
        expect(getTabSet("admin-connections").tabs.map((t) => t.label)).toEqual([
            "Sync Status",
            "Providers",
        ]);
    });

    it("holds the Data Confidence tabs of the design: the overview and its three sub-pages", () => {
        const set = getTabSet("data-confidence");
        expect(set.tabs.map((t) => [t.label, t.path])).toEqual([
            ["Overview", "/data-health"],
            ["Connectors", "/data-health/connectors"],
            ["Identity", "/data-health/identity"],
            ["Mapping", "/data-health/mapping"],
        ]);
        expect(set.tabs.every((t) => !("requiredFeature" in t))).toBe(true);
    });

    it("keeps the 13 rows of the old platform admin sidebar as the Platform and Platform billing tabs", () => {
        // `SuperadminSidebar.tsx` (deleted, CHAOS-7967) listed these rows; "Dashboard" is "Overview".
        const before = [
            ["Dashboard", "/superadmin"],
            ["Organizations", "/superadmin/orgs"],
            ["Users", "/superadmin/users"],
            ["Licensing", "/superadmin/licensing"],
            ["Product Telemetry", "/superadmin/product-telemetry"],
            ["Context Fabric Validation", "/superadmin/context-fabric/validation"],
            ["Audit Log", "/superadmin/audit"],
            ["Settings", "/superadmin/settings"],
            ["Billing Plans", "/superadmin/billing/plans"],
            ["Invoices", "/superadmin/billing/invoices"],
            ["Subscriptions", "/superadmin/billing/subscriptions"],
            ["Refunds", "/superadmin/billing/refunds"],
            ["Billing Audit", "/superadmin/billing/audit"],
        ];
        const tabs = [...getTabSet("platform").tabs, ...getTabSet("platform-billing").tabs];
        expect(tabs.map((t) => [t.label, t.path])).toEqual(
            before.map(([label, path]) => [label === "Dashboard" ? "Overview" : label, path]),
        );
    });

    it("keeps every page of the old admin sidebar, with its route and its entitlement key", () => {
        const adminTabs = [getTabSet("admin-organization"), getTabSet("admin-connections")].flatMap(
            (set): TabSet["tabs"][number][] => [...set.tabs],
        );
        expect(adminTabs).toHaveLength(ADMIN_SIDEBAR_BEFORE.length);
        for (const [label, path, feature] of ADMIN_SIDEBAR_BEFORE) {
            const tab = adminTabs.find((t) => t.path === path);
            expect(tab, path).toBeDefined();
            expect(tab?.label, path).toBe(ADMIN_RENAMED[label] ?? label);
            expect(tab?.requiredFeature, path).toBe(feature);
        }
    });

    it("hides a feature tab until the organization has the feature", () => {
        const audit = getTabSet("admin-organization").tabs.find((t) => t.id === "audit-logs")!;
        expect(isTabVisible(audit, {})).toBe(false);
        expect(isTabVisible(audit, { audit_log: false })).toBe(false);
        expect(isTabVisible(audit, { audit_log: true })).toBe(true);
        expect(isTabVisible(getTabSet("admin-organization").tabs[0], {})).toBe(true);
    });

    it("finds the route tab of a path by the longest tab route", () => {
        const at = (pathname: string) => {
            const found = routeTabForPathname(pathname);
            return found ? `${found.set.id}/${found.tab.id}` : undefined;
        };
        expect(at("/org/admin")).toBe("admin-organization/overview");
        expect(at("/org/admin/users")).toBe("admin-organization/users");
        expect(at("/org/admin/users/u1/edit")).toBe("admin-organization/users");
        expect(at("/org/admin/ai/byo-llm")).toBe("admin-organization/ai-setup");
        expect(at("/org/admin/sync/c1/runs/r1")).toBe("admin-connections/sync");
        expect(at("/org/admin/integrations/github/sync")).toBe("admin-connections/providers");
        expect(at("/org/administration")).toBeUndefined();
        expect(at("/testops/pipelines")).toBe("testops/pipelines");
        expect(at("/data-health")).toBe("data-confidence/overview");
        expect(at("/data-health/identity")).toBe("data-confidence/identity");
        expect(at("/settings")).toBeUndefined();
        expect(at("/superadmin/users")).toBe("platform/users");
        expect(at("/superadmin/licensing/o1")).toBe("platform/licensing");
        expect(at("/superadmin/billing/refunds")).toBe("platform-billing/refunds");
        expect(at("/superadmin/billing")).toBe("platform/overview");
    });

    it("a route tab's path selects the destination of its set in the sidebar", () => {
        for (const set of SETS.filter((s) => s.param === "route")) {
            const area = areaOf(set.areaId)!;
            for (const tab of set.tabs) {
                expect(selectedChildForPathname(area, tab.path!)?.path, `${set.id}/${tab.id}`).toBe(
                    set.childPath ?? set.basePath,
                );
            }
        }
    });

    it("the Metrics data is keyed by exactly the registry's tab ids, in registry order", () => {
        expect(METRIC_TABS.map((tab) => tab.id)).toEqual(
            getTabSet("metrics").tabs.map((tab) => tab.id),
        );
        for (const tab of METRIC_TABS) {
            expect(tab.metrics.length, tab.id).toBeGreaterThan(0);
            expect(tab.highlight, tab.id).toBeTruthy();
        }
    });

    it.each(Object.keys(PAGE_FILE) as Array<keyof typeof PAGE_FILE>)(
        "%s renders its tabs from the registry and holds no inline list",
        (page) => {
            const source = readFileSync(join(process.cwd(), "src", PAGE_FILE[page]), "utf8");
            expect(source).toContain(`getTabSet("${page}")`);
            expect(source).toMatch(/tabHref\((tabSet|\w+Tabs|set), (tab\.id|id)\)/);
            // No tab literal of the old inline list is left in the page.
            for (const [id, label] of BEFORE[page]) {
                expect(source).not.toContain(`id: "${id}"`);
                expect(source).not.toContain(`label: "${label}"`);
            }
        },
    );
});
