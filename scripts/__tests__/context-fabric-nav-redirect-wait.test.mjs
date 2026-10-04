import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CHAOS-8523 cause 1: the mobile-navigation test opened "/work" (a legacy route that redirects to
// "/diagnose" after its first document) and pressed Escape on the first document; 7 ms later the
// browser loaded "/diagnose" and the focus check ran on a new element. The test must wait for the
// redirect target before it clicks. This source check pins the order of the three steps.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const spec = fs.readFileSync(
    path.join(ROOT, "tests/acr-context-fabric.production.spec.ts"),
    "utf8",
);
const start = spec.indexOf(
    'test("closes mobile navigation with Escape and restores focus to its control"',
);
const body = spec.slice(start, spec.indexOf("\n    });", start));

describe("context-fabric mobile navigation test", () => {
    it("finds the test body", () => {
        expect(start).toBeGreaterThan(0);
        expect(body).toContain('page.goto("/work")');
    });

    it("waits for the /diagnose redirect target between goto and the first click", () => {
        const goto = body.indexOf('page.goto("/work")');
        const wait = body.search(/page\.waitForURL\(\s*\/\\\/diagnose/u);
        const click = body.indexOf("navigationControl.click()");
        expect(wait, "no waitForURL for the redirect target").toBeGreaterThan(goto);
        expect(click).toBeGreaterThan(wait);
    });

    it("does not raise a timeout or retry to hide the race", () => {
        expect(body).not.toMatch(/waitForTimeout|retries|test\.slow|setTimeout/u);
    });
});
