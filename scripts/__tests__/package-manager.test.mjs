import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

    it("accepts a readable extensionless pnpm shim", () => {
        const entrypoint = temporaryPath("pnpm");
        writeFileSync(entrypoint, "#!/usr/bin/env node\n");

        expect(resolvePackageManagerCommand({ npmExecPath: entrypoint })).toEqual({
            command: process.execPath,
            args: [entrypoint],
        });
    });

    it.each([
        ["ELF", [0x7f, 0x45, 0x4c, 0x46]],
        ["Mach-O 64-bit", [0xcf, 0xfa, 0xed, 0xfe]],
    ])("runs the sibling dist/pnpm.mjs for a native %s pnpm executable", (_name, magic) => {
        const entrypoint = temporaryPath("pnpm");
        writeFileSync(entrypoint, Buffer.from([...magic, 0, 0, 0, 0]));
        const script = path.join(path.dirname(entrypoint), "dist", "pnpm.mjs");
        mkdirSync(path.dirname(script));
        writeFileSync(script, "");

        expect(resolvePackageManagerCommand({ npmExecPath: entrypoint })).toEqual({
            command: process.execPath,
            args: [script],
        });
    });

    it("rejects a native pnpm executable that has no readable dist/pnpm.mjs", () => {
        const entrypoint = temporaryPath("pnpm");
        writeFileSync(entrypoint, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0]));

        expect(() => resolvePackageManagerCommand({ npmExecPath: entrypoint })).toThrow(
            "cannot read its JavaScript entrypoint",
        );
    });

    it("accepts a readable symlink entrypoint", (context) => {
        const target = temporaryPath("pnpm-target.mjs");
        const entrypoint = temporaryPath("pnpm.mjs");
        writeFileSync(target, "");

        try {
            symlinkSync(target, entrypoint);
        } catch (error) {
            if (error?.code === "EACCES" || error?.code === "EPERM") {
                context.skip("the host does not permit creating symlinks");
            }
            throw error;
        }

        expect(resolvePackageManagerCommand({ npmExecPath: entrypoint })).toEqual({
            command: process.execPath,
            args: [entrypoint],
        });
    });

    it("rejects a broken symlink entrypoint", (context) => {
        const entrypoint = temporaryPath("pnpm.mjs");

        try {
            symlinkSync(path.join(path.dirname(entrypoint), "missing.mjs"), entrypoint);
        } catch (error) {
            if (error?.code === "EACCES" || error?.code === "EPERM") {
                context.skip("the host does not permit creating symlinks");
            }
            throw error;
        }

        expect(() => resolvePackageManagerCommand({ npmExecPath: entrypoint })).toThrow(
            "cannot read npm_execpath",
        );
    });

    it("rejects an unreadable entrypoint through the readability seam", () => {
        const entrypoint = temporaryPath("pnpm.mjs");
        writeFileSync(entrypoint, "");

        expect(() =>
            resolvePackageManagerCommand({ npmExecPath: entrypoint, isReadable: () => false }),
        ).toThrow("cannot read npm_execpath");
    });

    it("accepts a UNC entrypoint through the Windows path abstraction", () => {
        const entrypoint = "\\\\server\\share\\Program Files\\pnpm.mjs";

        expect(
            resolvePackageManagerCommand({
                platform: "win32",
                npmExecPath: entrypoint,
                isReadable: () => true,
            }),
        ).toEqual({ command: process.execPath, args: [entrypoint] });
    });

    it("rejects a directory with a JavaScript extension as nonregular", () => {
        const entrypoint = temporaryPath("pnpm.mjs");
        mkdirSync(entrypoint);

        expect(() => resolvePackageManagerCommand({ npmExecPath: entrypoint })).toThrow(
            "cannot read npm_execpath",
        );
    });

    it.each(["pnpm.txt", "pnpm-shim", "pnpm.mjs/"])(
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
