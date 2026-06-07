export const LEGACY_WORK_TAB_REDIRECTS = {
    overview: "/diagnose",
    flow: "/metrics?tab=flow",
    investment: "/investment",
    landscape: "/landscape",
    capacity: "/plan/capacity",
    heatmap: "/cognitive-load?tab=heatmap",
    flame: "/complexity?tab=flame",
    graph: "/diagnose/work-graph",
    evidence: "/diagnose/work-graph?evidence=open",
} as const;

export type SearchParamsRecord = {
    [key: string]: string | string[] | undefined;
};

export type LegacyWorkTab = keyof typeof LEGACY_WORK_TAB_REDIRECTS;

type LegacyWorkRedirectInput = {
    view?: string;
    tab?: string;
};

export function buildLegacyWorkRedirectTarget(targetPath: string, params: SearchParamsRecord) {
    const [pathname, existingQuery = ""] = targetPath.split("?", 2);
    const nextParams = new URLSearchParams(existingQuery);
    for (const [key, value] of Object.entries(params)) {
        if (key !== "tab" && key !== "view") {
            if (nextParams.has(key)) continue;
            if (typeof value === "string") {
                nextParams.set(key, value);
            } else {
                for (const entry of value ?? []) {
                    nextParams.append(key, entry);
                }
            }
        }
    }
    const query = nextParams.toString();
    return query ? `${pathname}?${query}` : pathname;
}

export function resolveLegacyWorkRedirect({ view, tab }: LegacyWorkRedirectInput): string | null {
    if (view === "work" && (!tab || tab === "overview")) return LEGACY_WORK_TAB_REDIRECTS.graph;
    if (tab) return LEGACY_WORK_TAB_REDIRECTS[tab as LegacyWorkTab] ?? null;
    return LEGACY_WORK_TAB_REDIRECTS.overview;
}
