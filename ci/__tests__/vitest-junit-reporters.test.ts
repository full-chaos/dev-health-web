import { describe, expect, it } from "vitest";
import { vitestReporters } from "../vitest-reporters";

describe("vitest reporters (CHAOS-13768)", () => {
    it("keeps the default reporter only when VITEST_JUNIT_FILE is unset", () => {
        expect(vitestReporters({})).toEqual(["default"]);
    });

    it("keeps the default reporter only when VITEST_JUNIT_FILE is empty", () => {
        expect(vitestReporters({ VITEST_JUNIT_FILE: "" })).toEqual(["default"]);
    });

    it("adds the junit reporter writing to VITEST_JUNIT_FILE, after the default reporter", () => {
        expect(vitestReporters({ VITEST_JUNIT_FILE: "/tmp/x/junit.xml" })).toEqual([
            "default",
            ["junit", { outputFile: "/tmp/x/junit.xml" }],
        ]);
    });
});
