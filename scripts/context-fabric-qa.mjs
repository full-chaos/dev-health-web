import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { resolvePackageManagerCommand } from "./package-manager.mjs";

const environment = {
    ...process.env,
    AUTH_SECRET: "context-fabric-production-playwright",
    BACKEND_URL: "http://127.0.0.1:8012",
    NEXT_PUBLIC_SENTRY_REPLAY_ROUTES: "",
    NODE_ENV: "production",
};

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

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The guided onboarding Playwright suite runs `next dev` with
// NEXT_DIST_DIR=".next-guided", which Next expands to `.next-guided/dev/types/*`.
// Playwright force-kills that dev server on teardown, which can leave a partially
// written (corrupt) generated route-type validator behind. This Context Fabric
// production build uses the default `.next` distDir, but Next only filters the
// ACTIVE distDir's generated dev types during its type-check, so a stale
// `.next-guided/dev/types` would be pulled into the production TypeScript program
// and fail the build. Remove the ignored guided output before building so each
// Context Fabric build type-checks only its own freshly generated `.next/types`.
export async function removeGuidedBuildOutput({
    rmImplementation = rm,
    guidedDir = resolve(repositoryRoot, ".next-guided"),
} = {}) {
    await rmImplementation(guidedDir, { recursive: true, force: true });
}

export async function main({
    runCommand = run,
    platform = process.platform,
    npmExecPath = process.env.npm_execpath,
    isReadable,
    cleanGuidedBuildOutput = removeGuidedBuildOutput,
} = {}) {
    const packageManager = resolvePackageManagerCommand({
        platform,
        npmExecPath,
        isReadable,
    });
    await cleanGuidedBuildOutput();
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
