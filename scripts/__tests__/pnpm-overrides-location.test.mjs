/**
 * CHAOS-3157: pnpm reads overrides only from pnpm-workspace.yaml (or pnpm.overrides).
 * A top-level package.json `overrides` block is ignored by pnpm, so a floor declared there is never enforced.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

describe("dependency overrides location", () => {
    it("package.json has no top-level overrides block", () => {
        expect(pkg.overrides).toBeUndefined();
    });

    it("package.json has no pnpm.overrides block (pnpm-workspace.yaml is the one location)", () => {
        expect(pkg.pnpm?.overrides).toBeUndefined();
    });
});
