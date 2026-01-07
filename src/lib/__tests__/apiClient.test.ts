import { describe, expect, it } from "vitest";

import { apiClient } from "@/lib/apiClient";

describe("apiClient.buildUrl", () => {
  it("skips empty values while keeping falsy primitives", () => {
    const url = new URL(
      apiClient.buildUrl("/api/v1/test", {
        a: "one",
        b: "",
        c: undefined,
        d: 0,
        e: false,
      })
    );

    expect(url.pathname).toBe("/api/v1/test");
    expect(url.searchParams.get("a")).toBe("one");
    expect(url.searchParams.has("b")).toBe(false);
    expect(url.searchParams.has("c")).toBe(false);
    expect(url.searchParams.get("d")).toBe("0");
    expect(url.searchParams.get("e")).toBe("false");
  });
});
