import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { generateKeyPairSync } from "node:crypto";
import { join, resolve } from "node:path";
import { shouldForwardSupervisorSignal } from "./owned-process-lifecycle.mjs";

const rootDirectory = resolve(import.meta.dirname, "..");
const resultsDirectory = join(rootDirectory, "test-results");
const keysDirectory = join(resultsDirectory, "context-fabric-keys");
const runtimeDirectory = join(resultsDirectory, "context-fabric-runtime");

function run(command, args, options = {}) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, { stdio: "inherit", ...options });
        child.once("error", reject);
        child.once("exit", (code, signal) => resolvePromise({ code, signal }));
    });
}

async function requireSuccess(command, args, options) {
    const result = await run(command, args, options);
    if (result.code !== 0) {
        throw new Error(`${command} exited before Context Fabric startup completed.`);
    }
}

async function writeAssertionKey() {
    const { privateKey } = generateKeyPairSync("ed25519");
    await writeFile(
        join(keysDirectory, "web-assertion.key"),
        privateKey.export({ format: "pem", type: "pkcs8" }),
        { mode: 0o600 },
    );
}

async function prepareAcrMock() {
    await rm(keysDirectory, { force: true, recursive: true });
    await mkdir(keysDirectory, { recursive: true });
    await writeAssertionKey();
    await requireSuccess("openssl", [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        join(keysDirectory, "tls.key"),
        "-out",
        join(keysDirectory, "tls.crt"),
        "-subj",
        "/CN=127.0.0.1",
        "-days",
        "1",
    ]);
}

async function prepareBff() {
    await rm(runtimeDirectory, { force: true, recursive: true });
    await mkdir(join(runtimeDirectory, ".next"), { recursive: true });
    await cp(join(rootDirectory, ".next", "standalone"), runtimeDirectory, { recursive: true });
    await cp(join(rootDirectory, ".next", "static"), join(runtimeDirectory, ".next", "static"), {
        recursive: true,
    });
    await Promise.all(
        ["public", "scripts"].map((directory) =>
            cp(join(rootDirectory, directory), join(runtimeDirectory, directory), {
                recursive: true,
            }),
        ),
    );
    await requireSuccess(process.execPath, ["scripts/write-runtime-config.mjs"], {
        cwd: runtimeDirectory,
    });
}

async function startOwned(command, args, options = {}) {
    const child = spawn(process.execPath, ["scripts/run-owned-process.mjs", command, ...args], {
        stdio: "inherit",
        ...options,
    });
    for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
            if (shouldForwardSupervisorSignal()) child.kill(signal);
        });
    }
    child.once("error", (error) => {
        throw error;
    });
    child.once("exit", (code) => {
        process.exitCode = code ?? 1;
    });
}

const launchTarget = process.argv[2];
if (launchTarget === "ops-mock") {
    await startOwned(process.execPath, ["--import", "tsx", "./tests/mocks/http-server.ts"], {
        cwd: rootDirectory,
        env: { ...process.env, MOCK_SERVER_PORT: "8012" },
    });
} else if (launchTarget === "acr-mock") {
    await prepareAcrMock();
    await startOwned(process.execPath, ["--import", "tsx", "tests/mocks/acr-server.ts"], {
        cwd: rootDirectory,
        env: {
            ...process.env,
            ACR_MOCK_CERT_FILE: join("test-results", "context-fabric-keys", "tls.crt"),
            ACR_MOCK_KEY_FILE: join("test-results", "context-fabric-keys", "tls.key"),
            ACR_MOCK_PORT: "8013",
        },
    });
} else if (launchTarget === "bff") {
    await prepareBff();
    await startOwned(process.execPath, ["server.js"], {
        cwd: runtimeDirectory,
        env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: "3012" },
    });
} else {
    throw new Error("Expected Context Fabric launcher target: ops-mock, acr-mock, or bff.");
}
