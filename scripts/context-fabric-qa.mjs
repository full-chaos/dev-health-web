import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const environment = {
    ...process.env,
    AUTH_SECRET: "context-fabric-production-playwright",
    BACKEND_URL: "http://127.0.0.1:8012",
    NODE_ENV: "production",
};

export function resolvePnpmCommand(platform = process.platform) {
    return platform === "win32" ? "pnpm.cmd" : "pnpm";
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

export async function main({ runCommand = run, platform = process.platform } = {}) {
    await preflightOpenSSL({ runCommand });
    const packageManager = resolvePnpmCommand(platform);
    if ((await runCommand(packageManager, ["build"])) === 0) {
        return runCommand(packageManager, [
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
