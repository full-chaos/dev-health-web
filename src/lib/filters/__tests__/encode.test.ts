import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilter, filterFromQueryParams } from "@/lib/filters/encode";

describe("filters encode/decode", () => {
    it("roundtrips filters", () => {
        const encoded = encodeFilter(defaultMetricFilter);
        const decoded = decodeFilter(encoded);
        expect(decoded).toEqual(defaultMetricFilter);
    });

    it("maps legacy query params to filter", () => {
        const filter = filterFromQueryParams({
            scope_type: "team",
            scope_id: "alpha",
            range_days: "7",
            compare_days: "14",
        });
        expect(filter.scope.level).toBe("team");
        expect(filter.scope.ids).toEqual(["alpha"]);
        expect(filter.time.range_days).toBe(7);
        expect(filter.time.compare_days).toBe(14);
    });

    // CHAOS-7799: no query reads these five, so an old URL that carries them still parses; they are dropped.
    describe("old URLs that carry the never-read filters", () => {
        const rawParam = (filter: unknown) =>
            Buffer.from(JSON.stringify(filter), "utf-8").toString("base64url");
        const kept = {
            time: { range_days: 30, compare_days: 30 },
            scope: { level: "team", ids: ["alpha"] },
            who: { developers: ["ana@example.com"] },
            what: { repos: ["org/api"], services: ["billing"] },
            why: { work_category: ["feature"], initiative: ["growth"] },
            how: { wip_state: ["doing"] },
        };
        const cases: Array<[string, string, string, unknown]> = [
            ["who.roles", "who", "roles", ["reviewer"]],
            ["what.artifacts", "what", "artifacts", ["pr", "issue"]],
            ["why.issue_type", "why", "issue_type", ["bug"]],
            ["how.flow_stage", "how", "flow_stage", ["review"]],
            ["how.blocked", "how", "blocked", true],
        ];

        it.each(cases)("drops %s and keeps the rest of the filter", (_name, group, key, value) => {
            const old = structuredClone(kept) as Record<string, Record<string, unknown>>;
            old[group][key] = value;

            const decoded = decodeFilter(rawParam(old)) as unknown as Record<
                string,
                Record<string, unknown>
            >;

            expect(decoded[group]).not.toHaveProperty(key);
            expect(decoded).toEqual({ ...kept, scope: kept.scope });
            // The next encode does not bring it back.
            const again = Buffer.from(
                encodeFilter(decoded as unknown as Parameters<typeof encodeFilter>[0]),
                "base64url",
            ).toString("utf-8");
            expect(again).not.toContain(`"${key}"`);
        });

        it("drops all five at once", () => {
            const old = {
                ...kept,
                who: { ...kept.who, roles: ["reviewer"] },
                what: { ...kept.what, artifacts: ["pr"] },
                why: { ...kept.why, issue_type: ["bug"] },
                how: { ...kept.how, flow_stage: ["review"], blocked: true },
            };
            expect(decodeFilter(rawParam(old))).toEqual(kept);
        });
    });
});
