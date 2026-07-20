import { describe, expect, it } from "vitest";

import { scrubBreadcrumb } from "../scrubber";

describe("Sentry telemetry scrubbing", () => {
    it("returns a redacted breadcrumb without mutating its nested telemetry payload", () => {
        const breadcrumb = {
            category: "fetch",
            data: {
                request: {
                    authorization: "Bearer original-token",
                    diagnostic: "kept",
                },
            },
        };

        const result = scrubBreadcrumb(breadcrumb);

        expect(result).not.toBe(breadcrumb);
        expect(result.data).toEqual({
            request: { authorization: "[Filtered]", diagnostic: "kept" },
        });
        expect(breadcrumb.data).toEqual({
            request: { authorization: "Bearer original-token", diagnostic: "kept" },
        });
    });
});
