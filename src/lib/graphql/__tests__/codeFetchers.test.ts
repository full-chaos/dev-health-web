import { describe, expect, it, vi, beforeEach } from "vitest";

import { getBusFactorViaGraphQL } from "../codeFetchers";
import type { BusFactorResult } from "../types";

vi.mock("../urqlClient", () => ({
  graphqlFetch: vi.fn(),
}));

import { graphqlFetch } from "../urqlClient";

const mockedFetch = vi.mocked(graphqlFetch);

const sampleResult: BusFactorResult = {
  scopeValue: 3,
  topMaintainers: [
    { author: "alice@example.com", sharePercent: 0.45 },
    { author: "bob@example.com", sharePercent: 0.3 },
  ],
  perRepo: [
    {
      repoId: "repo-1",
      repoName: "web",
      value: 2,
      topMaintainers: [{ author: "alice@example.com", sharePercent: 0.6 }],
      evidenceSampleCount: 124,
    },
  ],
  evidenceSampleCount: 250,
};

describe("getBusFactorViaGraphQL", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
  });

  it("returns the busFactor payload from the GraphQL response", async () => {
    mockedFetch.mockResolvedValueOnce({ busFactor: sampleResult });

    const result = await getBusFactorViaGraphQL("org-1", { repoId: "repo-1" });

    expect(result).toEqual(sampleResult);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockedFetch.mock.calls[0];
    expect(callArgs[1]).toEqual({ orgId: "org-1", scope: { repoId: "repo-1" } });
    expect(callArgs[2]).toEqual({ orgId: "org-1" });
  });

  it("normalizes a missing scope argument to null", async () => {
    mockedFetch.mockResolvedValueOnce({ busFactor: sampleResult });

    await getBusFactorViaGraphQL("org-1");

    const callArgs = mockedFetch.mock.calls[0];
    expect(callArgs[1]).toEqual({ orgId: "org-1", scope: null });
  });
});
