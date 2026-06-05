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
import { resolveActiveView, WORK_TABS } from "../workPageView";

type VisibleChildDestination = {
    area: NavArea;
    child: NavChildRoute;
};

type WorkTab = (typeof WORK_TABS)[number];

const appRoot = join(process.cwd(), "src/app/(app)");
const workPagePath = join(appRoot, "work/page.tsx");
const workPageSource = readFileSync(workPagePath, "utf8");

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
    "src/app/(app)/plan/delivery-forecast/page.tsx",
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
        "points $source $intent straight at $expectedPath (no /work loopback)",
        (entry) => {
            const url = parseHref(entry.href);
            expect(
                url.pathname,
                `${entry.href} should be a direct destination, not a /work workbench loopback`,
            ).toBe(entry.expectedPath);
            expect(routePageExists(entry.href), entry.href).toBe(true);
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
