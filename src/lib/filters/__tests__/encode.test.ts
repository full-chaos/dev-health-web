import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import {
  decodeFilter,
  encodeFilter,
  filterFromQueryParams,
} from "@/lib/filters/encode";

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
});
