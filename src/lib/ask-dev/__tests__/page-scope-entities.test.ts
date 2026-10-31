import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

import { scopePageEntities } from "../page-scope-entities";

// CHAOS-11938, lead ruling 2026-10-31: an overview page proposes the one team or repository it is
// scoped to; the filter itself (window, role, other filters) is never proposed.
const WEB = "00000000-0000-4000-8000-0000000e2e01";
const OPS = "00000000-0000-4000-8000-0000000e2e02";
const NAMES = {
    teams: { "linear:TEAMA": "Platform" },
    repos: { [WEB]: "dev-health-web", [OPS]: "dev-health-ops" },
};
const filter = (patch: Partial<MetricFilter>): MetricFilter => ({
    ...defaultMetricFilter,
    ...patch,
});
const entities = (
    patch: Partial<MetricFilter>,
    routeId: Parameters<typeof scopePageEntities>[0]["routeId"] = "bottlenecks",
    names: Parameters<typeof scopePageEntities>[0]["names"] = NAMES,
) => scopePageEntities({ routeId, filters: filter(patch), names });

describe("scopePageEntities", () => {
    it("proposes the one team of a team scope, by ACR's id and its served name", () => {
        expect(entities({ scope: { level: "team", ids: ["linear:TEAMA"] } })).toEqual([
            { kind: "team", id: "team:linear:TEAMA", label: "Platform" },
        ]);
    });

    it("labels a team with no served name by its id", () => {
        expect(entities({ scope: { level: "team", ids: ["core"] } })).toEqual([
            { kind: "team", id: "team:core", label: "core" },
        ]);
    });

    it("proposes no team when the scope holds several, or none", () => {
        expect(entities({ scope: { level: "team", ids: ["core", "growth"] } })).toEqual([]);
        expect(entities({ scope: { level: "team", ids: [] } })).toEqual([]);
    });

    it("maps the one repository name of a repository scope to its served id", () => {
        expect(entities({ scope: { level: "repo", ids: ["dev-health-web"] } })).toEqual([
            { kind: "repository", id: `repository:${WEB}`, label: "dev-health-web" },
        ]);
    });

    it("takes a repository value that already is a served id as it is", () => {
        expect(entities({ scope: { level: "repo", ids: [OPS] } })).toEqual([
            { kind: "repository", id: `repository:${OPS}`, label: "dev-health-ops" },
        ]);
    });

    it("never guesses a repository: a name two ids share, or one the map does not hold", () => {
        const shared = { teams: {}, repos: { [WEB]: "dev-health-web", [OPS]: "dev-health-web" } };
        expect(
            entities({ scope: { level: "repo", ids: ["dev-health-web"] } }, "bottlenecks", shared),
        ).toEqual([]);
        expect(entities({ scope: { level: "repo", ids: ["unknown-repo"] } })).toEqual([]);
        expect(
            entities({ scope: { level: "repo", ids: ["dev-health-web"] } }, "bottlenecks", {
                teams: {},
                repos: {},
            }),
        ).toEqual([]);
    });

    it("takes the one repository of the repository filter beside a team scope", () => {
        expect(
            entities({
                scope: { level: "team", ids: ["linear:TEAMA"] },
                what: { repos: ["dev-health-ops"] },
            }),
        ).toEqual([
            { kind: "team", id: "team:linear:TEAMA", label: "Platform" },
            { kind: "repository", id: `repository:${OPS}`, label: "dev-health-ops" },
        ]);
        expect(entities({ what: { repos: ["dev-health-web", "dev-health-ops"] } })).toEqual([]);
    });

    it("proposes nothing for a developer or a service scope: never a person", () => {
        expect(entities({ scope: { level: "developer", ids: ["ada@example.com"] } })).toEqual([]);
        expect(entities({ scope: { level: "service", ids: ["api"] } })).toEqual([]);
        expect(entities({ scope: { level: "org", ids: [] } })).toEqual([]);
    });

    it("returns only the kinds the route takes", () => {
        const both: Partial<MetricFilter> = {
            scope: { level: "team", ids: ["linear:TEAMA"] },
            what: { repos: ["dev-health-web"] },
        };
        expect(entities(both, "complexity").map((entity) => entity.kind)).toEqual(["repository"]);
        expect(entities(both, "data_health").map((entity) => entity.kind)).toEqual(["repository"]);
        expect(entities(both, "pull_request_detail")).toEqual([]);
        expect(entities(both, "cognitive_load").map((entity) => entity.kind)).toEqual([
            "team",
            "repository",
        ]);
    });

    // Lead ruling on #1647 (codex r1 P2): a page proposes each entity it shows when there is exactly
    // one, and ONLY the kinds its route allows (CHAOS-11936 route map). The table is written out, not
    // read from the route map, so a route map change fails here until it is decided.
    it.each([
        ["flow_metrics", ["team", "repository"]],
        ["investment", ["team", "repository"]],
        ["complexity", ["repository"]],
        ["cognitive_load", ["team", "repository"]],
        ["bottlenecks", ["team", "repository"]],
        ["data_health", ["repository"]],
        ["pull_request_detail", []],
        ["work_item_detail", []],
    ] as const)(
        "%s proposes exactly the kinds %j for one team and one repository",
        (routeId, kinds) => {
            const proposed = entities(
                {
                    scope: { level: "team", ids: ["linear:TEAMA"] },
                    what: { repos: ["dev-health-web"] },
                },
                routeId,
            );
            expect(proposed.map((entity) => entity.kind)).toEqual(kinds);
        },
    );

    it("carries kind, id and label only: no window, role or other filter", () => {
        const [team] = entities({
            scope: { level: "team", ids: ["linear:TEAMA"] },
            time: { range_days: 90, compare_days: 90 },
            why: { work_category: ["feature"] },
        });
        expect(Object.keys(team ?? {}).sort()).toEqual(["id", "kind", "label"]);
    });
});
