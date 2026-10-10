/**
 * CHAOS-9145: /explore names the scope by its display name, never by an id. The REAL page, the
 * real name helper and the real filter-options reader run; only the transports are replaced.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen } from "@/test/utils";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilter } from "@/lib/filters/encode";
import { containsIdToken } from "@/lib/labels/idToken";

const { postJson, getJson } = vi.hoisted(() => ({ postJson: vi.fn(), getJson: vi.fn() }));
vi.mock("@/lib/api/_shared", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/_shared")>()),
    postJson,
}));
vi.mock("@/lib/apiClient", async (importOriginal) => {
    const mod = await importOriginal<typeof import("@/lib/apiClient")>();
    return { ...mod, apiClient: { ...mod.apiClient, getJson } };
});
vi.mock("@/components/evidence/EvidencePanel", () => ({ EvidencePanel: () => null }));
vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: async () => ({ data: { id: "o1", name: "Full Chaos" } }),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/explore",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => null }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));

import Explore from "./page";

const TEAM_ID = "jira:3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";
const TEAM_ID_2 = "gh:payments-core";
const ID_WORDS = /\bjira:|\bgh:|\bgithub:|\bgitlab:|\blinear:|\bcustom:|[0-9a-f]{8}-[0-9a-f]{4}-/i;

const answer = {
    metric: "cycle_time",
    label: "Cycle Time",
    unit: "days",
    value: 4.2,
    delta_pct: -12,
    drivers: [],
    contributors: [],
    drilldown_links: {},
};

const renderTeams = async (ids: string[], names: Record<string, string>) => {
    postJson.mockResolvedValue(answer);
    getJson.mockResolvedValue({ team_names: names });
    render(
        await Explore({
            searchParams: Promise.resolve({
                metric: "cycle_time",
                f: encodeFilter({ ...defaultMetricFilter, scope: { level: "team", ids } }),
            }),
        }),
    );
    return document.body.textContent ?? "";
};

beforeEach(() => {
    postJson.mockReset();
    getJson.mockReset();
});

describe("/explore names the scope (CHAOS-9145)", () => {
    it("a team with a served name draws the name in the sentence and the Scope fact", async () => {
        const text = await renderTeams([TEAM_ID], { [TEAM_ID]: "Platform" });
        expect(text).toContain("This view explains Cycle Time for Platform over the last");
        expect(screen.getByTestId("explore-context-facts")).toHaveTextContent("team: Platform");
        expect(text).not.toContain(TEAM_ID);
    });

    it("a team with no served name draws the chip label, never the id", async () => {
        const text = await renderTeams([TEAM_ID], {});
        expect(text).toContain("This view explains Cycle Time for Unresolved over the last");
        expect(text).not.toContain(TEAM_ID);
    });

    it("several teams are joined as before, by name", async () => {
        const text = await renderTeams([TEAM_ID, TEAM_ID_2], {
            [TEAM_ID]: "Platform",
            [TEAM_ID_2]: "Payments",
        });
        expect(text).toContain("for Platform, Payments over");
    });

    it("the page text holds no id token for a team scope", async () => {
        const text = await renderTeams([TEAM_ID, TEAM_ID_2], { [TEAM_ID]: "Platform" });
        expect(text).not.toMatch(ID_WORDS);
        expect(containsIdToken(text)).toBe(false);
    });

    it("no ids: the sentence is unchanged and no names are read", async () => {
        postJson.mockResolvedValue(answer);
        render(await Explore({ searchParams: Promise.resolve({ metric: "cycle_time" }) }));
        expect(document.body.textContent).toContain("for all orgs over the last");
        expect(getJson).not.toHaveBeenCalled();
    });

    it("repositories and developers in the facts draw names, never ids", async () => {
        postJson.mockResolvedValue(answer);
        getJson.mockResolvedValue({
            repo_names: { "gh:acme/api": "acme/api" },
            developer_names: { "dev-3f2a9c1e": "Sam" },
        });
        render(
            await Explore({
                searchParams: Promise.resolve({
                    metric: "cycle_time",
                    f: encodeFilter({
                        ...defaultMetricFilter,
                        what: { repos: ["gh:acme/api", "gh:9f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c"] },
                        who: { developers: ["dev-3f2a9c1e"] },
                    }),
                }),
            }),
        );
        const facts = screen.getByTestId("explore-context-facts");
        expect(facts).toHaveTextContent("Repositoriesacme/api, Unresolved");
        expect(facts).toHaveTextContent("DevelopersSam");
        expect(document.body.textContent).not.toMatch(ID_WORDS);
    });
});
