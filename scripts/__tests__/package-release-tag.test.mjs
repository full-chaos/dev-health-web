import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CHAOS-8014: the "Validate release tag" step of package.yml took a regex written with `\\.` inside
// single quotes, so no vX.Y.Z tag could pass. This test takes the regex from the workflow text and runs
// it through the same `grep -Eq` the step runs.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workflow = fs.readFileSync(path.join(ROOT, ".github/workflows/package.yml"), "utf8");
const pattern = /grep -Eq '([^']+)'/u.exec(workflow)?.[1];

const matches = (tag) =>
    spawnSync("grep", ["-Eq", pattern], { input: tag, encoding: "utf8" }).status === 0;

describe("package.yml release tag check", () => {
    it("finds the regex in the workflow", () => {
        expect(pattern).toBeTruthy();
    });

    it.each(["v1.2.3", "v1.1.0", "v10.20.30", "v1.2.3-rc.1", "v1.2.3-beta", "v1.2.3.4"])(
        "accepts %s",
        (tag) => {
            expect(matches(tag)).toBe(true);
        },
    );

    it.each(["1.2.3", "v1.2", "v1", "v1.2.x", "vX.Y.Z", "v1x2x3", "v1\\2\\3", "v1.2.3 ", "latest"])(
        "rejects %s",
        (tag) => {
            expect(matches(tag)).toBe(false);
        },
    );
});
