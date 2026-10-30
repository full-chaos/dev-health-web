import { afterEach, describe, expect, it, vi } from "vitest";

import ChartEscapePage from "./page";

vi.mock("./ChartEscapeDemo", () => ({ ChartEscapeDemo: () => null }));

describe("/demo/chart-escape is a test-mode fixture only", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("answers not-found outside test mode (a production build)", () => {
        vi.stubEnv("NEXT_PUBLIC_DEV_HEALTH_TEST_MODE", "");
        expect(() => ChartEscapePage()).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    });

    it("renders in test mode", () => {
        vi.stubEnv("NEXT_PUBLIC_DEV_HEALTH_TEST_MODE", "true");
        expect(() => ChartEscapePage()).not.toThrow();
    });
});
