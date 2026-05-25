import { describe, expect, it } from "vitest";

import { sanitizeTelemetryPayload } from "../sanitize";

describe("sanitizeTelemetryPayload", () => {
  it("keeps primitive safe values", () => {
    expect(sanitizeTelemetryPayload({ surface: "metrics", count: 2, enabled: true, empty: null })).toEqual({
      surface: "metrics",
      count: 2,
      enabled: true,
      empty: null,
    });
  });

  it("drops unsafe keys and non-primitives", () => {
    expect(
      sanitizeTelemetryPayload({ email: "a@example.com", name: "Ada", stack: "trace", ok: "yes", nested: { a: 1 } }),
    ).toEqual({ ok: "yes" });
  });
});
