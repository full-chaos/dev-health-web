import { accessSync, constants } from "node:fs";
import path from "node:path";

export function isReadable(filePath) {
    try {
        accessSync(filePath, constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

export function resolvePackageManagerCommand({
    platform = process.platform,
    npmExecPath = process.env.npm_execpath,
    isReadable: checkReadable = isReadable,
} = {}) {
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
    if (extension !== ".js" && extension !== ".cjs") {
        throw new Error(
            "Package-manager QA requires npm_execpath to reference a JavaScript (.js or .cjs) file.",
        );
    }

    if (!checkReadable(npmExecPath)) {
        throw new Error(`Package-manager QA cannot read npm_execpath: ${npmExecPath}`);
    }

    return { command: process.execPath, args: [npmExecPath] };
}
