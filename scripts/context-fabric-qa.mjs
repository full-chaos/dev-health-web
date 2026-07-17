import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const environment = {
    ...process.env,
    AUTH_SECRET: "context-fabric-production-playwright",
    BACKEND_URL: "http://127.0.0.1:8012",
    NODE_ENV: "production",
};

function isReadable(filePath) {
    try {
        accessSync(filePath, constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

export function resolvePnpmCommand({
    platform = process.platform,
    npmExecPath = process.env.npm_execpath,
    isReadable: checkReadable = isReadable,
} = {}) {
    if (typeof npmExecPath !== "string" || npmExecPath.length === 0) {
        throw new Error(
            "Context Fabric QA requires npm_execpath from the package manager; run this command through pnpm.",
        );
    }

    const pathApi = platform === "win32" ? path.win32 : path.posix;
    if (!pathApi.isAbsolute(npmExecPath)) {
        throw new Error("Context Fabric QA requires an absolute npm_execpath JavaScript path.");
    }

    const extension = pathApi.extname(npmExecPath).toLowerCase();
    if (extension !== ".js" && extension !== ".cjs") {
        throw new Error(
            "Context Fabric QA requires npm_execpath to reference a JavaScript (.js or .cjs) file.",
        );
    }

    if (!checkReadable(npmExecPath)) {
        throw new Error(`Context Fabric QA cannot read npm_execpath: ${npmExecPath}`);
    }

    return { command: process.execPath, args: [npmExecPath] };
}

export function run(
    command,
    args,
    { environment: spawnEnvironment = environment, spawnImplementation = spawn } = {},
) {
    return new Promise((resolvePromise, reject) => {
        const child = spawnImplementation(command, args, {
            env: spawnEnvironment,
            stdio: "inherit",
            shell: false,
        });
        child.once("error", reject);
        child.once("exit", (code) => resolvePromise(code ?? 1));
    });
}

export async function preflightOpenSSL({ runCommand = run } = {}) {
    try {
        const exitCode = await runCommand("openssl", ["version"]);
        if (exitCode !== 0) throw new Error(`exited with code ${exitCode}`);
    } catch (error) {
        const detail = error instanceof Error ? ` (${error.message})` : "";
        throw new Error(
            `Context Fabric QA requires OpenSSL on PATH to create its local HTTPS certificate${detail}. Install OpenSSL and reopen your terminal before retrying.`,
        );
    }
}

export async function main({
    runCommand = run,
    platform = process.platform,
    npmExecPath = process.env.npm_execpath,
    isReadable: checkReadable = isReadable,
} = {}) {
    await preflightOpenSSL({ runCommand });
    const packageManager = resolvePnpmCommand({
        platform,
        npmExecPath,
        isReadable: checkReadable,
    });
    if ((await runCommand(packageManager.command, [...packageManager.args, "build"])) === 0) {
        return runCommand(packageManager.command, [
            ...packageManager.args,
            "exec",
            "playwright",
            "test",
            "-c",
            "playwright.context-fabric.config.ts",
        ]);
    }
    return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        process.exitCode = await main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}
