import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchFilterNames = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/filterOptions", () => ({ fetchFilterNames }));

import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

import { loadScopePageEntities } from "../load-page-scope-entities";

// CHAOS-11938: the names are read only when the scope can propose something, so a page that
// proposes nothing pays no extra request.
const filter = (patch: Partial<MetricFilter>): MetricFilter => ({
    ...defaultMetricFilter,
    ...patch,
});

beforeEach(() => {
    fetchFilterNames.mockReset();
    fetchFilterNames.mockResolvedValue({
        teams: { core: "Core" },
        repos: { "repo-1": "dev-health-web" },
        developers: {},
    });
});

describe("loadScopePageEntities", () => {
    it("reads no names when the scope cannot propose anything", async () => {
        for (const patch of [
            {},
            { scope: { level: "team" as const, ids: ["core", "growth"] } },
            { scope: { level: "developer" as const, ids: ["ada@example.com"] } },
            { what: { repos: ["a", "b"] } },
        ]) {
            await expect(
                loadScopePageEntities({
                    routeId: "flow_metrics",
                    view: "metrics",
                    filters: filter(patch),
                }),
            ).resolves.toEqual([]);
        }
        expect(fetchFilterNames).not.toHaveBeenCalled();
    });

    it("reads the names once for one team or one repository, and proposes them", async () => {
        await expect(
            loadScopePageEntities({
                routeId: "flow_metrics",
                view: "metrics",
                filters: filter({
                    scope: { level: "team", ids: ["core"] },
                    what: { repos: ["dev-health-web"] },
                }),
            }),
        ).resolves.toEqual([
            { kind: "team", id: "team:core", label: "Core" },
            { kind: "repository", id: "repository:repo-1", label: "dev-health-web" },
        ]);
        expect(fetchFilterNames).toHaveBeenCalledTimes(1);
    });

    it("reads no names for a kind the route does not take (codex r1 on #1647)", async () => {
        // Complexity takes repositories only: one team there can propose nothing.
        await expect(
            loadScopePageEntities({
                routeId: "complexity",
                view: "complexity",
                filters: filter({ scope: { level: "team", ids: ["core"] } }),
            }),
        ).resolves.toEqual([]);
        // Pull request detail takes neither teams nor repositories.
        await expect(
            loadScopePageEntities({
                routeId: "pull_request_detail",
                view: "metrics",
                filters: filter({ what: { repos: ["dev-health-web"] } }),
            }),
        ).resolves.toEqual([]);
        expect(fetchFilterNames).not.toHaveBeenCalled();
    });

    it("proposes the scope the page settles on: a team-locked view drops a repository scope", async () => {
        // The scope bar rewrites `f` to the view's lock after mount (level moved, ids dropped), so
        // a repository scope there was the page's scope for one render only.
        await expect(
            loadScopePageEntities({
                routeId: "bottlenecks",
                view: "work",
                filters: filter({ scope: { level: "repo", ids: ["dev-health-web"] } }),
            }),
        ).resolves.toEqual([]);
        expect(fetchFilterNames).not.toHaveBeenCalled();
        // The repository filter is no scope level, so it stays.
        await expect(
            loadScopePageEntities({
                routeId: "bottlenecks",
                view: "work",
                filters: filter({
                    scope: { level: "repo", ids: ["dev-health-web"] },
                    what: { repos: ["dev-health-web"] },
                }),
            }),
        ).resolves.toEqual([
            { kind: "repository", id: "repository:repo-1", label: "dev-health-web" },
        ]);
    });

    it("keeps a repository scope where the scope bar locks nothing (codex r3 on #1647)", async () => {
        // The bar locks the scope only on a view with page filters; Complexity has none, so its
        // repository scope is the page's scope and its reads use it.
        await expect(
            loadScopePageEntities({
                routeId: "complexity",
                view: "complexity",
                filters: filter({ scope: { level: "repo", ids: ["dev-health-web"] } }),
            }),
        ).resolves.toEqual([
            { kind: "repository", id: "repository:repo-1", label: "dev-health-web" },
        ]);
    });

    it("on a failed read (empty maps) labels the team by its id and proposes no repository", async () => {
        fetchFilterNames.mockResolvedValue({ teams: {}, repos: {}, developers: {} });
        await expect(
            loadScopePageEntities({
                routeId: "flow_metrics",
                view: "metrics",
                filters: filter({
                    scope: { level: "team", ids: ["core"] },
                    what: { repos: ["dev-health-web"] },
                }),
            }),
        ).resolves.toEqual([{ kind: "team", id: "team:core", label: "core" }]);
    });
});
