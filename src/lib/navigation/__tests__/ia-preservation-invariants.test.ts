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
import { resolveActiveView, resolveRemovedWorkTabRedirect, WORK_TABS } from "../workPageView";

type VisibleChildDestination = {
    area: NavArea;
    child: NavChildRoute;
};

type WorkTab = (typeof WORK_TABS)[number];

const appRoot = join(process.cwd(), "src/app/(app)");
const workPagePath = join(appRoot, "work/page.tsx");
const workPageSource = readFileSync(workPagePath, "utf8");
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
    "src/app/(app)/work/page.tsx",
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

const isWorkTab = (value: string): value is WorkTab => {
    const tabs: readonly string[] = WORK_TABS;
    return tabs.includes(value);
};

const reachableKeyForHref = (href: string) => {
    const url = parseHref(href);
    if (url.pathname === "/work") {
        const tab = url.searchParams.get("tab");
        if (tab && isWorkTab(tab)) return `/work?tab=${tab}`;

        if (url.searchParams.get("view") === "work") return "/work?view=work";
    }
    return url.pathname;
};

const routeLabel = (area: NavArea, child: NavChildRoute) =>
    `${area.id}:${child.id} (${child.label}) -> ${child.path}`;

const resolveWorkHref = (href: string) => {
    const url = parseHref(href);
    const tab = url.searchParams.get("tab");
    const activeView = resolveActiveView(
        paramValue(url.searchParams, "view"),
        paramValue(url.searchParams, "tab"),
    );
    return { activeView, tab, url };
};

const expectDeepLinkResolvesToWorkbenchTab = (href: string, expectedTab: string) => {
    const { activeView, tab, url } = resolveWorkHref(href);

    expect(url.pathname, `${href} should remain a /work deep-link`).toBe("/work");
    expect(tab, `${href} should name its intended Work workbench tab`).toBe(expectedTab);
    if (!tab || !isWorkTab(tab)) {
        throw new Error(`${href} does not target a registered Work tab`);
    }
    expect(activeView, `${href} should not fall through to Diagnose Overview`).toBe("work");
    expect(
        url.searchParams.get("view"),
        `${href} should canonically pin view=work so a future resolver change can't reintroduce the loopback`,
    ).toBe("work");
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
            ...WORK_TABS.map((tab) => `/work?tab=${tab}`),
        ]);

        const baselineEntries = [
            ...iaPreservationBaseline.navVisibleDestinations.map((entry) => ({
                label: `nav:${entry.areaId}:${entry.childId}`,
                key: reachableKeyForHref(entry.path),
            })),
            ...iaPreservationBaseline.workWorkbenchViews.map((entry) => ({
                label: `work-tab:${entry.tab}`,
                key: reachableKeyForHref(entry.href),
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
    it("backs every navVisible destination with a real route and expected Work resolver branch", () => {
        for (const { area, child } of navVisibleDestinations()) {
            expect(routePageExists(child.path), routeLabel(area, child)).toBe(true);

            if (basePath(child.path) !== "/work") continue;

            const { activeView } = resolveWorkHref(child.path);
            const expectedView = child.id === "diagnose-overview" ? "overview" : "work";
            expect(activeView, routeLabel(area, child)).toBe(expectedView);
        }
    });

    it.each(WORK_TABS)("renders Work workbench tab %s instead of a fallback", (tab) => {
        const href = `/work?tab=${tab}`;
        const { activeView } = resolveWorkHref(href);

        expect(routePageExists(href), href).toBe(true);
        expect(activeView, `${href} should render the Work branch`).toBe("work");
        expect(workPageSource, `${href} should have a concrete page branch`).toContain(
            `activeTab === "${tab}"`,
        );
    });

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
    ] as const)("redirects retired Work tab %s to the real %s home", (tab, path, contentNeedle) => {
        expect(resolveRemovedWorkTabRedirect(tab), `/work?tab=${tab}`).toBe(path);
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
        expect(investmentPageSource).toContain('"/landscape",');
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
    // The CHAOS-2075 resolver fix routes every legacy `?tab=<workTab>` deep link to
    // the Work branch (resolveActiveView -> "work"), so these investigation links land
    // on their real workbench view, never Diagnose Overview. This invariant guards
    // against a regression of that fix (the #609/#610-class failure mode).
    it.each(iaPreservationBaseline.investigationDeepLinks)(
        "resolves $source $intent to its $expectedTab workbench view",
        (entry) => {
            expectDeepLinkResolvesToWorkbenchTab(entry.href, entry.expectedTab);
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

    it.each(WORK_TABS)(
        "preserves the legacy bare /work?tab=%s deep link (resolver still routes it to Work)",
        (tab) => {
            // Splits canonical-emitted policy (links SHOULD carry view=work) from the
            // preservation guarantee (legacy bare ?tab= links MUST keep resolving to Work).
            expect(resolveActiveView(undefined, tab), `/work?tab=${tab}`).toBe("work");
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
