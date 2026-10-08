import { accessSync, closeSync, constants, openSync, readSync, statSync } from "node:fs";
import path from "node:path";

export function isReadable(filePath) {
    try {
        accessSync(filePath, constants.R_OK);
        return statSync(filePath).isFile();
    } catch {
        return false;
    }
}

const nativeMagics = [
    [0x7f, 0x45, 0x4c, 0x46],
    [0xcf, 0xfa, 0xed, 0xfe],
    [0xce, 0xfa, 0xed, 0xfe],
    [0xfe, 0xed, 0xfa, 0xcf],
    [0xfe, 0xed, 0xfa, 0xce],
    [0xca, 0xfe, 0xba, 0xbe],
];

export function isNativeExecutable(filePath) {
    let fd;
    try {
        fd = openSync(filePath, "r");
        const head = Buffer.alloc(4);
        const read = readSync(fd, head, 0, 4, 0);
        if (read >= 2 && head[0] === 0x4d && head[1] === 0x5a) return true;
        return (
            read === 4 && nativeMagics.some((magic) => magic.every((byte, i) => head[i] === byte))
        );
    } catch {
        return false;
    } finally {
        if (fd !== undefined) closeSync(fd);
    }
}

export function resolvePackageManagerCommand(options = {}) {
    const {
        platform = process.platform,
        isReadable: checkReadable = isReadable,
        isNativeExecutable: checkNative = isNativeExecutable,
    } = options;
    const npmExecPath = "npmExecPath" in options ? options.npmExecPath : process.env.npm_execpath;
    if (typeof npmExecPath !== "string" || npmExecPath.length === 0) {
        throw new Error(
            "Package-manager QA requires npm_execpath from the package manager; run this command through pnpm.",
        );
    }

    const pathApi = platform === "win32" ? path.win32 : path.posix;
    if (!pathApi.isAbsolute(npmExecPath)) {
        throw new Error("Package-manager QA requires an absolute npm_execpath JavaScript path.");
    }

    const extension = pathApi.extname(npmExecPath).toLowerCase();
    const isPnpmShim = pathApi.basename(npmExecPath) === "pnpm";
    if (!isPnpmShim && extension !== ".js" && extension !== ".cjs" && extension !== ".mjs") {
        throw new Error(
            "Package-manager QA requires npm_execpath to reference a JavaScript (.js, .cjs, or .mjs) file.",
        );
    }

    if (!checkReadable(npmExecPath)) {
        throw new Error(`Package-manager QA cannot read npm_execpath: ${npmExecPath}`);
    }

    if (isPnpmShim && extension === "" && checkNative(npmExecPath)) {
        const entrypoint = pathApi.join(pathApi.dirname(npmExecPath), "dist", "pnpm.mjs");
        if (!checkReadable(entrypoint)) {
            throw new Error(
                `Package-manager QA found a native pnpm executable at npm_execpath and cannot read its JavaScript entrypoint: ${entrypoint}`,
            );
        }
        return { command: process.execPath, args: [entrypoint] };
    }

    return { command: process.execPath, args: [npmExecPath] };
}
