import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

import { graphqlFetch } from "@/lib/graphql/server";
import { TESTOPS_COVERAGE_QUERY, TESTOPS_PIPELINE_QUERY } from "../queries";

// The exact `query` string the real client puts on the wire (the cache exchange adds
// __typename). The API registers these texts, so a change here needs an API registration first.
async function wireQuery(document: string): Promise<string> {
    const bodies: string[] = [];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        if (init?.body) bodies.push(String(init.body));
        else bodies.push(String(new URL(String(input)).searchParams.get("query")));
        return new Response(
            JSON.stringify({ data: { analytics: { timeseries: [], breakdowns: [] } } }),
            {
                status: 200,
                headers: { "content-type": "application/json" },
            },
        );
    });
    await graphqlFetch(document, { orgId: "o", batch: {} }, { orgId: "o" });
    fetchSpy.mockRestore();
    expect(bodies).toHaveLength(1);
    const raw = bodies[0];
    try {
        return (JSON.parse(raw) as { query: string }).query;
    } catch {
        return raw;
    }
}

const PIPELINE_WIRE =
    "query TestOpsPipeline($orgId: String!, $batch: AnalyticsRequestInput!) {\n  analytics(orgId: $orgId, batch: $batch) {\n    timeseries {\n      dimension\n      dimensionValue\n      scope\n      measure\n      buckets {\n        date\n        value\n        __typename\n      }\n      __typename\n    }\n    breakdowns {\n      dimension\n      measure\n      items {\n        key\n        value\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}";
const COVERAGE_WIRE =
    "query TestOpsCoverage($orgId: String!, $batch: AnalyticsRequestInput!) {\n  analytics(orgId: $orgId, batch: $batch) {\n    timeseries {\n      dimension\n      dimensionValue\n      scope\n      measure\n      buckets {\n        date\n        value\n        __typename\n      }\n      __typename\n    }\n    breakdowns {\n      dimension\n      measure\n      items {\n        key\n        value\n        label\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}";

describe("TestOps wire documents (CHAOS-9738)", () => {
    afterEach(() => vi.restoreAllMocks());

    it("pipeline selects scope in timeseries on the wire", async () => {
        const q = await wireQuery(TESTOPS_PIPELINE_QUERY);
        expect(q).toBe(PIPELINE_WIRE);
        expect(q).toMatch(/dimensionValue\s+scope\s+measure/);
    });

    it("coverage selects scope in timeseries on the wire", async () => {
        const q = await wireQuery(TESTOPS_COVERAGE_QUERY);
        expect(q).toBe(COVERAGE_WIRE);
        expect(q).toMatch(/dimensionValue\s+scope\s+measure/);
    });
});
