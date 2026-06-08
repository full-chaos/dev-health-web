import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { iaPreservationBaseline } from "../__fixtures__/iaPreservationBaseline";
import {
    basePath,
    navAreas,
    selectedAreaIdForPathname,
    type NavArea,
    type NavChildRoute,
} from "../areas";
import { LEGACY_WORK_TAB_REDIRECTS, resolveLegacyWorkRedirect } from "../workPageView";

type VisibleChildDestination = {
    area: NavArea;
    child: NavChildRoute;
};

const appRoot = join(process.cwd(), "src/app/(app)");
const legacyWorkPagePath = join(appRoot, "work/page.tsx");
const legacyWorkPageSource = readFileSync(legacyWorkPagePath, "utf8");
const metricsPagePath = join(appRoot, "metrics/page.tsx");
const metricsPageSource = readFileSync(metricsPagePath, "utf8");
const testOpsTabsPath = join(appRoot, "testops/TestOpsTabs.tsx");
const investmentPageSource = readFileSync(join(appRoot, "investment/page.tsx"), "utf8");
const investmentViewSource = readFileSync(
    join(process.cwd(), "src/components/work/InvestmentView.tsx"),
    "utf8",
);
const investmentChartsSource = readFileSync(
    join(process.cwd(), "src/components/work/investment/InvestmentCharts.tsx"),
    "utf8",
);
const landscapePageSource = readFileSync(join(appRoot, "landscape/page.tsx"), "utf8");
const bottleneckPageSource = readFileSync(join(appRoot, "bottleneck/page.tsx"), "utf8");
const complexityPageSource = readFileSync(join(appRoot, "complexity/page.tsx"), "utf8");
const cognitiveLoadPageSource = readFileSync(join(appRoot, "cognitive-load/page.tsx"), "utf8");
const workGraphPageSource = readFileSync(join(appRoot, "diagnose/work-graph/page.tsx"), "utf8");

const testOpsTabRoutes = [
    {
        id: "overview",
        label: "Overview",
        path: "/testops",
        contentGuard: "TestOps summary",
    },
    {
        id: "pipelines",
        label: "Pipelines",
        path: "/testops/pipelines",
        contentGuard: "Success Rate Trend",
    },
    {
        id: "tests",
        label: "Tests",
        path: "/testops/tests",
        contentGuard: "Pass Rate Trend",
    },
    {
        id: "coverage",
        label: "Coverage",
        path: "/testops/coverage",
        contentGuard: "Line Coverage Trend",
    },
] as const;

const knownPreexistingDualContextBarScopes = new Set([
    "src/app/(app)/ai/automations/page.tsx",
    "src/app/(app)/ai/impact/page.tsx",
    "src/app/(app)/ai/page.tsx",
    "src/app/(app)/ai/review-load/page.tsx",
    "src/app/(app)/ai/risk/page.tsx",
    "src/app/(app)/code/page.tsx",
    "src/app/(app)/dashboard/page.tsx",
    "src/app/(app)/diagnose/page.tsx",
    "src/app/(app)/diagnose/work-graph/page.tsx",
    "src/app/(app)/explore/page.tsx",
    "src/app/(app)/investment/page.tsx",
    "src/app/(app)/landscape/page.tsx",
    "src/app/(app)/metrics/page.tsx",
    "src/app/(app)/opportunities/page.tsx",
    "src/app/(app)/people/page.tsx",
    "src/app/(app)/plan/capacity/page.tsx",
    "src/app/(app)/plan/page.tsx",
    "src/app/(app)/quality/page.tsx",
    "src/app/(app)/risk/compounding/page.tsx",
    "src/app/(app)/testops/coverage/page.tsx",
    "src/app/(app)/testops/page.tsx",
    "src/app/(app)/testops/pipelines/page.tsx",
    "src/app/(app)/testops/risk/page.tsx",
    "src/app/(app)/testops/tests/page.tsx",
]);

const routePageExists = (routePath: string) => {
    const segments = basePath(routePath).split("/").filter(Boolean);
    return [
        join(process.cwd(), "src/app/(app)", ...segments, "page.tsx"),
        join(process.cwd(), "src/app", ...segments, "page.tsx"),
    ].some((candidate) => existsSync(candidate));
};

const navVisibleDestinations = (): VisibleChildDestination[] =>
    navAreas.flatMap((area) =>
        area.children.filter((child) => child.navVisible).map((child) => ({ area, child })),
    );

const parseHref = (href: string) => new URL(href, "https://dev-health.local");

const paramValue = (params: URLSearchParams, name: string) => params.get(name) ?? undefined;

const reachableKeyForHref = (href: string) => {
    const url = parseHref(href);
    return url.pathname;
};

const routeLabel = (area: NavArea, child: NavChildRoute) =>
    `${area.id}:${child.id} (${child.label}) -> ${child.path}`;

const resolveLegacyWorkHref = (href: string) => {
    const url = parseHref(href);
    const target = resolveLegacyWorkRedirect({
        view: paramValue(url.searchParams, "view"),
        tab: paramValue(url.searchParams, "tab"),
    });
    return { target, url };
};

const expectDistributedDeepLink = (
    href: string,
    expectedPath: string,
    expectedTab: string | null,
) => {
    const url = parseHref(href);

    expect(url.pathname, `${href} should not be a /work workbench loopback`).toBe(expectedPath);
    expect(url.searchParams.get("tab"), `${href} tab target`).toBe(expectedTab);
};

const listRouteFiles = (directory: string): string[] => {
    const entries = readdirSync(directory);
    return entries.flatMap((entry) => {
        const fullPath = join(directory, entry);
        const stats = statSync(fullPath);
        if (stats.isDirectory()) return listRouteFiles(fullPath);
        return entry === "page.tsx" || entry === "layout.tsx" ? [fullPath] : [];
    });
};

const mountsGlobalContextBar = (source: string) =>
    /<GlobalContextBar(?:Client)?[\s/>]/.test(source);
const mountsPageFilterBar = (source: string) => /<FilterBar(?:Client)?[\s/>]/.test(source);

describe("IA preservation invariant #1 — no orphaned views", () => {
    it("keeps every baseline nav/work/deep-link destination reachable", () => {
        const liveReachable = new Set([
            ...navVisibleDestinations().map(({ child }) => reachableKeyForHref(child.path)),
            ...iaPreservationBaseline.investigationDeepLinks.map((entry) =>
                reachableKeyForHref(entry.href),
            ),
            ...iaPreservationBaseline.directDestinationLinks.map((entry) =>
                reachableKeyForHref(entry.href),
            ),
        ]);

        const baselineEntries = [
            ...iaPreservationBaseline.navVisibleDestinations.map((entry) => ({
                label: `nav:${entry.areaId}:${entry.childId}`,
                key: reachableKeyForHref(entry.path),
            })),
            ...iaPreservationBaseline.investigationDeepLinks.map((entry) => ({
                label: `deep-link:${entry.source}:${entry.intent}`,
                key: reachableKeyForHref(entry.href),
            })),
        ];

        const orphaned = baselineEntries.filter((entry) => !liveReachable.has(entry.key));

        expect(
            orphaned,
            `orphaned IA baseline destinations: ${orphaned
                .map((entry) => `${entry.label} -> ${entry.key}`)
                .join(", ")}`,
        ).toEqual([]);
    });
});

describe("IA preservation invariant #2 — no redirect-only tabs", () => {
    it("backs every navVisible destination with a real route", () => {
        for (const { area, child } of navVisibleDestinations()) {
            expect(routePageExists(child.path), routeLabel(area, child)).toBe(true);
        }
    });

    it.each(iaPreservationBaseline.legacyWorkRedirects)(
        "redirects legacy $href to distributed destination $expectedPath",
        (entry) => {
            const { target } = resolveLegacyWorkHref(entry.href);
            expect(target, entry.href).toContain(entry.expectedPath);
            expect(routePageExists(entry.expectedPath), entry.expectedPath).toBe(true);
            expect(legacyWorkPageSource).toContain("resolveLegacyWorkRedirect");
            expect(legacyWorkPageSource).toContain("redirect(");
        },
    );

    it.each(testOpsTabRoutes)(
        "renders TestOps tab $label at $path with real page content",
        (tab) => {
            const pagePath = join(appRoot, ...tab.path.split("/").filter(Boolean), "page.tsx");
            const source = readFileSync(pagePath, "utf8");
            const tabsSource = readFileSync(testOpsTabsPath, "utf8");

            expect(routePageExists(tab.path), tab.path).toBe(true);
            expect(source, `${tab.path} should render the shared TestOps tab strip`).toContain(
                "<TestOpsTabs",
            );
            expect(tabsSource, "TestOpsTabs should use the ViewSet primitive").toContain(
                "<ViewSet",
            );
            expect(tabsSource, "TestOpsTabs should render the ViewSet as tabs").toContain(
                'orientation="tabs"',
            );
            expect(tabsSource, `${tab.path} should include a ${tab.label} tab item`).toContain(
                `id: "${tab.id}"`,
            );
            expect(source, `${tab.path} should render its real content`).toContain(
                tab.contentGuard,
            );
            expect(source, `${tab.path} should not be a redirect-only tab`).not.toContain(
                "redirect(",
            );
        },
    );

    it.each([
        ["flow", "/metrics?tab=flow", "flow"],
        ["investment", "/investment", "InvestmentView"],
        ["landscape", "/landscape", "Cycle Time × Throughput"],
        ["capacity", "/plan/capacity", "Capacity"],
        ["heatmap", "/cognitive-load?tab=heatmap", "Focus fragmentation"],
        ["flame", "/complexity?tab=flame", "ComplexityDashboard"],
        ["graph", "/diagnose/work-graph", "Work Graph Explorer"],
        ["evidence", "/diagnose/work-graph?evidence=open", "Work Graph Explorer"],
    ] as const)("redirects retired Work tab %s to the real %s home", (tab, path, contentNeedle) => {
        expect(LEGACY_WORK_TAB_REDIRECTS[tab], `/work?tab=${tab}`).toBe(path);
        expect(routePageExists(path), path).toBe(true);

        if (basePath(path) === "/metrics") {
            expect(metricsPageSource).toContain(`id: "${contentNeedle}"`);
        }
        if (path === "/investment") {
            expect(investmentPageSource).toContain(`<${contentNeedle}`);
        }
        if (path === "/landscape") {
            expect(landscapePageSource).toContain(contentNeedle);
        }
        if (basePath(path) === "/diagnose/work-graph") {
            expect(routePageExists(path), path).toBe(true);
            expect(workGraphPageSource).toContain("Work Graph views");
            for (const label of [
                "Overview",
                "Dependencies",
                "Inflow-Outflow",
                "Review Network",
                "Artifacts",
            ]) {
                expect(workGraphPageSource).toContain(label);
            }
        }
        if (basePath(path) === "/cognitive-load") {
            expect(routePageExists(path), path).toBe(true);
            expect(cognitiveLoadPageSource).toContain("<ViewSet");
            expect(cognitiveLoadPageSource).toContain('id: "heatmap"');
            expect(cognitiveLoadPageSource).toContain("<HeatmapView");
        }
        if (basePath(path) === "/complexity") {
            expect(routePageExists(path), path).toBe(true);
            expect(complexityPageSource).toContain("<ViewSet");
            expect(complexityPageSource).toContain('id: "flame"');
            expect(complexityPageSource).toContain("<FlameView");
        }
        if (path === "/plan/capacity") {
            expect(routePageExists(path), path).toBe(true);
        }
    });

    it("mounts the full Investment chart workbench on /investment", () => {
        expect(investmentPageSource).toContain("<InvestmentView");
        expect(investmentViewSource).toContain("<InvestmentCharts");
        for (const chart of [
            "InvestmentMixSection",
            "TeamCategorySankeySection",
            "RepoTeamSankeySection",
            "TeamExchangeChordSection",
        ]) {
            expect(investmentChartsSource).toContain(chart);
        }
        expect(investmentViewSource).toContain("InvestmentWorkUnitList");
        expect(investmentViewSource).toContain("How this was calculated");
    });

    it("preserves role context on standalone /investment and investment drill-down links", () => {
        expect(investmentPageSource).toContain("const roleParam");
        expect(investmentPageSource).toContain("const activeRole");
        expect(investmentPageSource).toContain("role={activeRole}");
        expect(investmentPageSource).toContain("activeRole={activeRole}");
        expect(investmentPageSource).toContain("role: activeRole");
        expect(investmentPageSource).toContain("withFilterParam(");
        // Investment's BackLink now points at its IA parent /diagnose (CHAOS-2079),
        // still wrapped in withFilterParam so the user's filter/role/origin scope is
        // preserved on the way back. Guarding the literal keeps that scope intact.
        expect(investmentPageSource).toContain('"/diagnose",');
        expect(investmentPageSource).toContain("activeOrigin,");
    });

    it("splits landscape and bottleneck quadrant ownership without duplicated scatters", () => {
        expect(landscapePageSource).toContain("cycle_throughput");
        expect(landscapePageSource).toContain("churn_throughput");
        expect(landscapePageSource).not.toContain("wip_throughput");
        expect(landscapePageSource).not.toContain("review_load_latency");

        expect(bottleneckPageSource).toContain("wip_throughput");
        expect(bottleneckPageSource).toContain("review_load_latency");
        expect(bottleneckPageSource).not.toContain("churn_throughput");
        expect(bottleneckPageSource).not.toContain("cycle_throughput");
    });

    it("clamps Landscape role primary quadrants to metrics still rendered on Landscape", () => {
        expect(landscapePageSource).toContain("landscapePrimaryType");
        // landscapePrimaryType is now lens-driven via getLandscapePrimaryType (lensContext.ts),
        // which clamps any role primaryQuadrant to the Landscape-safe set.
        expect(landscapePageSource).toContain("getLandscapePrimaryType");
        expect(landscapePageSource).not.toContain("primaryQuadrant");
        expect(landscapePageSource).not.toContain("getRoleConfig");
    });
});

describe("IA preservation invariant #8 — Lens present in global context bar", () => {
    const globalContextBarClientSource = readFileSync(
        join(process.cwd(), "src/components/navigation/GlobalContextBarClient.tsx"),
        "utf8",
    );
    const lensSelectorSource = readFileSync(
        join(process.cwd(), "src/components/navigation/LensSelector.tsx"),
        "utf8",
    );

    it("GlobalContextBarClient imports and renders LensSelector", () => {
        expect(globalContextBarClientSource).toContain("LensSelector");
    });

    it("LensSelector has a data-testid for test discoverability", () => {
        expect(lensSelectorSource).toContain('data-testid="lens-selector"');
    });

    it("LensSelector writes lens= to URL on selection", () => {
        expect(lensSelectorSource).toContain('params.set("lens"');
    });

    it("LensSelector reads lens= first and falls back to role= (legacy alias)", () => {
        expect(lensSelectorSource).toContain("getLensFromSearchParams");
    });
});

describe("IA preservation invariant #3 — no dead investigation deep-links", () => {
    it.each(iaPreservationBaseline.investigationDeepLinks)(
        "points $source $intent to distributed destination $expectedPath",
        (entry) => {
            expectDistributedDeepLink(entry.href, entry.expectedPath, entry.expectedTab);
            expect(routePageExists(entry.href), entry.href).toBe(true);
        },
    );

    it.each(iaPreservationBaseline.directDestinationLinks)(
        "points $source $intent straight at $expectedPath rendering the real $expectedTab content",
        (entry) => {
            const url = parseHref(entry.href);
            expect(
                url.pathname,
                `${entry.href} should be a direct destination, not a /work workbench loopback`,
            ).toBe(entry.expectedPath);
            expect(routePageExists(entry.href), entry.href).toBe(true);

            // Content guard: routePageExists strips the query, so a route can exist while
            // the deep-linked tab is gone. For the Metrics destination, assert the page
            // resolves ?tab from the query AND defines the expected tab id, so a removed or
            // renamed Flow tab fails here instead of silently dropping to the default tab.
            const tab = url.searchParams.get("tab");
            if (entry.expectedPath === "/metrics" && tab) {
                expect(tab, entry.href).toBe(entry.expectedTab);
                expect(
                    metricsPageSource,
                    `metrics page must resolve ?tab from the query for ${entry.href}`,
                ).toContain("tab.id === tabParam");
                expect(
                    metricsPageSource,
                    `metrics page must define the "${entry.expectedTab}" tab for ${entry.href}`,
                ).toContain(`id: "${entry.expectedTab}"`);
            }
        },
    );

    it.each(iaPreservationBaseline.legacyWorkRedirects)(
        "keeps legacy $href as a redirect, not a generic Overview loopback",
        (entry) => {
            const { target } = resolveLegacyWorkHref(entry.href);
            expect(target, entry.href).toContain(entry.expectedPath);
        },
    );
});

describe("IA preservation invariant #4 — no phantom chrome", () => {
    it("assigns every navVisible route to the area that owns its chrome", () => {
        for (const { area, child } of navVisibleDestinations()) {
            const pathname = basePath(child.path);
            expect(selectedAreaIdForPathname(navAreas, pathname), routeLabel(area, child)).toBe(
                area.id,
            );
        }
    });

    it("keeps /explore from rendering foreign area chrome unless it becomes navVisible", () => {
        const exploreIsNavVisible = navVisibleDestinations().some(
            ({ child }) => basePath(child.path) === "/explore",
        );
        const exploreOwner = selectedAreaIdForPathname(navAreas, "/explore");

        expect(
            Boolean(exploreOwner) || !exploreIsNavVisible,
            `/explore owner=${exploreOwner ?? "none"} navVisible=${exploreIsNavVisible}`,
        ).toBe(true);
    });
});

describe("IA preservation invariant #5 — one context bar", () => {
    it("prevents any new page scope from mounting both global and page-level bars", () => {
        // Unit-tier enforcement uses static source scanning because rendering every RSC page
        // would move this guard out of the merge-blocking lib test project. The allowlist is
        // the current pre-existing debt baseline; any new dual-bar page fails until the page
        // removes one bar or deliberately updates this documented list.
        const routeFiles = listRouteFiles(appRoot);
        const dualBarFiles = routeFiles
            .filter((filePath) => {
                const source = readFileSync(filePath, "utf8");
                return mountsGlobalContextBar(source) && mountsPageFilterBar(source);
            })
            .map((filePath) => relative(process.cwd(), filePath));

        const unapproved = dualBarFiles.filter(
            (filePath) => !knownPreexistingDualContextBarScopes.has(filePath),
        );
        const staleAllowlist = [...knownPreexistingDualContextBarScopes].filter(
            (filePath) => !dualBarFiles.includes(filePath),
        );

        expect(
            unapproved,
            `new page scopes with both GlobalContextBar and FilterBar: ${unapproved.join(", ")}`,
        ).toEqual([]);
        expect(
            staleAllowlist,
            `remove fixed one-context-bar scopes from the allowlist: ${staleAllowlist.join(", ")}`,
        ).toEqual([]);
    });

    it("checks direct page/layout pairs as one route scope", () => {
        const routeFiles = listRouteFiles(appRoot);
        const directories = new Set(routeFiles.map((filePath) => dirname(filePath)));
        const unapproved = [...directories].flatMap((directory) => {
            const pagePath = join(directory, "page.tsx");
            const layoutPath = join(directory, "layout.tsx");
            const sources = [pagePath, layoutPath]
                .filter((filePath) => existsSync(filePath))
                .map((filePath) => readFileSync(filePath, "utf8"));
            const hasGlobal = sources.some(mountsGlobalContextBar);
            const hasFilter = sources.some(mountsPageFilterBar);
            const relativePagePath = relative(process.cwd(), pagePath);

            return hasGlobal &&
                hasFilter &&
                !knownPreexistingDualContextBarScopes.has(relativePagePath)
                ? [relativePagePath]
                : [];
        });

        expect(
            unapproved,
            `new page/layout route scopes with both GlobalContextBar and FilterBar: ${unapproved.join(", ")}`,
        ).toEqual([]);
    });
});

describe("IA preservation invariant #6 — route safety", () => {
    it("backs every navVisible child base path with a real page.tsx", () => {
        for (const { area, child } of navVisibleDestinations()) {
            expect(routePageExists(child.path), routeLabel(area, child)).toBe(true);
        }
    });

    it("keeps preview routes hidden and out of navVisible destinations", () => {
        for (const area of navAreas) {
            for (const child of area.children) {
                if (child.preview) {
                    expect(child.navVisible, routeLabel(area, child)).toBe(false);
                }
                if (child.navVisible) {
                    expect(child.preview, routeLabel(area, child)).not.toBe(true);
                }
            }
        }
    });
});

describe("IA preservation invariant #7 — reachable redirect aliases stay guarded", () => {
    // De-circularizes the baseline for redirect aliases: instead of trusting the hand
    // fixture, scan the filesystem for redirect-only route pages and require each to be
    // registered. Closes the /team-flow blind spot the adversarial review found — a new
    // reachable alias cannot go unguarded, and a deleted alias/target is caught.
    const knownNonAliasRedirectPages = new Set<string>([
        // Pages that call redirect() as a guard rather than as a reachable alias.
        // /work redirects retired tabs (flow/investment/landscape/capacity) to their
        // standalone homes while still rendering the Work branch for live tabs (CHAOS-2102).
        "/work",
    ]);

    const routeForPageFile = (filePath: string): string => {
        const segments = relative(appRoot, dirname(filePath))
            .split("/")
            .filter((seg) => seg.length > 0 && !(seg.startsWith("(") && seg.endsWith(")")));
        return `/${segments.join("/")}`;
    };

    const scanRedirectOnlyRoutes = (dir: string): string[] =>
        readdirSync(dir).flatMap((entry) => {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) return scanRedirectOnlyRoutes(full);
            if (entry !== "page.tsx") return [];
            const src = readFileSync(full, "utf8");
            return /\bredirect\s*\(/.test(src) && src.includes("next/navigation")
                ? [routeForPageFile(full)]
                : [];
        });

    it("registers every redirect-only route in legacyAliasRoutes (no unguarded aliases)", () => {
        const registered = new Set<string>(
            iaPreservationBaseline.legacyAliasRoutes.map((alias) => alias.route),
        );
        const unguarded = scanRedirectOnlyRoutes(appRoot).filter(
            (route) => !registered.has(route) && !knownNonAliasRedirectPages.has(route),
        );
        expect(
            unguarded,
            `redirect-only routes reachable on disk but not in legacyAliasRoutes: ${unguarded.join(", ")}`,
        ).toEqual([]);
    });

    it.each(iaPreservationBaseline.legacyAliasRoutes)(
        "keeps alias $route redirecting to the live destination $redirectsTo",
        (alias) => {
            expect(routePageExists(alias.route), `${alias.route} alias page missing`).toBe(true);
            expect(
                routePageExists(alias.redirectsTo),
                `${alias.route} redirects to a dead destination ${alias.redirectsTo}`,
            ).toBe(true);
        },
    );

    it("keeps /team-flow alias on the Flow metrics tab instead of Diagnose overview", () => {
        const source = readFileSync(join(appRoot, "team-flow/page.tsx"), "utf8");
        expect(source).toContain(
            'redirect(tail ? `/metrics?tab=flow&${tail}` : "/metrics?tab=flow")',
        );
    });
});
