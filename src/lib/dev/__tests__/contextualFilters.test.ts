import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";

import { askDevContextForMetricSurface, repositoryIdsFromMetricFilter } from "../contextualFilters";

describe("Ask Dev metric surface contexts", () => {
    it("maps repository filters to typed refs without exposing raw IDs as labels", () => {
        const filters = {
            ...defaultMetricFilter,
            scope: { level: "repo" as const, ids: ["repo-a", "repo-a", "repo-b"] },
        };

        expect(repositoryIdsFromMetricFilter(filters)).toEqual(["repo-a", "repo-b"]);
        const context = askDevContextForMetricSurface({
            filters,
            routeId: "flow_metrics",
        });
        expect(context).toMatchObject({
            routeId: "flow_metrics",
            entityRefs: [
                {
                    entity_type: "repository",
                    entity_id: "repo-a",
                    display_label: "Selected repository 1",
                },
                {
                    entity_type: "repository",
                    entity_id: "repo-b",
                    display_label: "Selected repository 2",
                },
            ],
            filterFingerprint: expect.stringMatching(/^filter-v1-[a-f0-9]{8}$/),
        });
        expect(JSON.stringify(context)).not.toContain('"display_label":"repo-a"');
    });

    it("permits organization/team metric surfaces but requires repository scope for complexity", () => {
        expect(
            askDevContextForMetricSurface({
                filters: defaultMetricFilter,
                routeId: "investment",
            }),
        ).toMatchObject({ routeId: "investment", entityRefs: [] });
        expect(
            askDevContextForMetricSurface({
                filters: defaultMetricFilter,
                routeId: "complexity",
            }),
        ).toBeNull();
    });

    it("fails closed for URL-shaped repository identifiers", () => {
        const filters = {
            ...defaultMetricFilter,
            scope: { level: "repo" as const, ids: ["https://other-tenant.example/repo"] },
        };
        expect(askDevContextForMetricSurface({ filters, routeId: "flow_metrics" })).toBeNull();
    });
});
