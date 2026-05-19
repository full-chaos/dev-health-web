import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { withFilterParam } from "@/lib/filters/url";

describe("withFilterParam", () => {
  it("places encoded filters before URL fragments", () => {
    const href = withFilterParam("/ai/impact#opportunities", defaultMetricFilter);

    expect(href).toMatch(/^\/ai\/impact\?f=/);
    expect(href).toContain("#opportunities");
    expect(href).not.toContain("#opportunities?f=");
  });
});
