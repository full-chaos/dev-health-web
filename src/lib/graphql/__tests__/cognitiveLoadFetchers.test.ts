import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCognitiveLoadViaGraphQL } from "../cognitiveLoadFetchers";

vi.mock("../server", () => ({
    graphqlFetch: vi.fn(),
}));

import { graphqlFetch } from "../server";

const mockedFetch = vi.mocked(graphqlFetch);

const sampleResult = {
    orgId: "org-1",
    teamId: null,
    totalDays: 0,
    signals: [],
};

describe("getCognitiveLoadViaGraphQL", () => {
    beforeEach(() => {
        mockedFetch.mockReset();
    });

    it("threads the selected repoId through to the GraphQL input variables (CHAOS-2386)", async () => {
        mockedFetch.mockResolvedValueOnce({ cognitiveLoad: sampleResult });

        await getCognitiveLoadViaGraphQL({
            orgId: "org-1",
            sinceDate: "2026-06-01",
            untilDate: "2026-06-30",
            teamId: "team-1",
            repoId: "full-chaos/dev-health-ops",
        });

        expect(mockedFetch).toHaveBeenCalledTimes(1);
        const callArgs = mockedFetch.mock.calls[0];
        expect(callArgs[1]).toEqual({
            input: {
                orgId: "org-1",
                sinceDate: "2026-06-01",
                untilDate: "2026-06-30",
                teamId: "team-1",
                repoId: "full-chaos/dev-health-ops",
            },
        });
        expect(callArgs[2]).toEqual({ orgId: "org-1" });
    });

    it("normalizes a missing repoId to null", async () => {
        mockedFetch.mockResolvedValueOnce({ cognitiveLoad: sampleResult });

        await getCognitiveLoadViaGraphQL({
            orgId: "org-1",
            sinceDate: "2026-06-01",
            untilDate: "2026-06-30",
        });

        const callArgs = mockedFetch.mock.calls[0];
        expect(callArgs[1]).toEqual({
            input: {
                orgId: "org-1",
                sinceDate: "2026-06-01",
                untilDate: "2026-06-30",
                teamId: null,
                repoId: null,
            },
        });
    });

    it("returns the cognitiveLoad payload from the GraphQL response", async () => {
        mockedFetch.mockResolvedValueOnce({ cognitiveLoad: sampleResult });

        const result = await getCognitiveLoadViaGraphQL({
            orgId: "org-1",
            sinceDate: "2026-06-01",
            untilDate: "2026-06-30",
        });

        expect(result).toEqual(sampleResult);
    });
});
