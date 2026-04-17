import { describe, expect, it, vi } from "vitest";
import type { SSRData, SSRExchange } from "@urql/core";
import { createGraphQLClientOptions } from "../providerClient";

vi.mock("@/lib/origin", () => ({
  resolveOrigin: () => "https://dev-health.test",
}));

function makeSsrExchange(): SSRExchange {
  return {
    restoreData: vi.fn(),
    extractData: vi.fn(() => ({}) as SSRData),
  } as unknown as SSRExchange;
}

describe("createGraphQLClientOptions", () => {
  it("defaults the browser client to cache-first", () => {
    const options = createGraphQLClientOptions({
      orgId: "acme",
      ssr: makeSsrExchange(),
    });

    expect(options.requestPolicy).toBe("cache-first");
    expect(options.url).toBe("https://dev-health.test/graphql?org_id=acme");
  });
});
