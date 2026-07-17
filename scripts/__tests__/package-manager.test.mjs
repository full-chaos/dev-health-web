import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolvePackageManagerCommand } from "../package-manager.mjs";

const temporaryRoots = new Set();

afterEach(() => {
    for (const root of temporaryRoots) rmSync(root, { force: true, recursive: true });
    temporaryRoots.clear();
});

function temporaryPath(fileName) {
    const root = mkdtempSync(path.join(os.tmpdir(), "package-manager-"));
    temporaryRoots.add(root);
    return path.join(root, fileName);
}

describe("resolvePackageManagerCommand", () => {
    it("accepts a readable pnpm.mjs entrypoint", () => {
        const entrypoint = temporaryPath("pnpm.mjs");
        writeFileSync(entrypoint, "");

        expect(resolvePackageManagerCommand({ npmExecPath: entrypoint })).toEqual({
            command: process.execPath,
            args: [entrypoint],
        });
    });

    it.each(["pnpm.txt", "pnpm", "pnpm.mjs/"])(
        "rejects a non-JavaScript or directory entrypoint: %s",
        (fileName) => {
            const entrypoint = temporaryPath(fileName);
            if (fileName.endsWith("/")) mkdirSync(entrypoint);
            else writeFileSync(entrypoint, "");

            expect(() => resolvePackageManagerCommand({ npmExecPath: entrypoint })).toThrow(
                /JavaScript|cannot read/,
            );
        },
    );

    it("rejects a relative entrypoint", () => {
        expect(() =>
            resolvePackageManagerCommand({ npmExecPath: "node_modules/pnpm/bin/pnpm.mjs" }),
        ).toThrow("absolute npm_execpath");
    });
});
