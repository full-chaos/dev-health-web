import { spawn } from "node:child_process";

const environment = {
    ...process.env,
    AUTH_SECRET: "context-fabric-production-playwright",
    BACKEND_URL: "http://127.0.0.1:8012",
    NODE_ENV: "production",
};

function run(command, args) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, { env: environment, stdio: "inherit" });
        child.once("error", reject);
        child.once("exit", (code) => resolvePromise(code ?? 1));
    });
}

if ((await run("pnpm", ["build"])) === 0) {
    process.exitCode = await run("pnpm", [
        "exec",
        "playwright",
        "test",
        "-c",
        "playwright.context-fabric.config.ts",
    ]);
} else {
    process.exitCode = 1;
}
