import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { hostname } from "node:os";
import path from "node:path";

// allow: SIZE_OK — atomic artifact transactions and their owner-verified lease protocol share one filesystem boundary.
const ARTIFACT_DIRECTORIES = new Set(["examples", "openapi", "schemas"]);
const ARTIFACT_SIBLINGS = new Set(["../contracts.ts", "../generated.ts"]);
const LOCK_WAIT_MILLIS = 10;
const LOCK_TIMEOUT_MILLIS = 30_000;
const LOCK_WAIT_STATE = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

function command(commandName, args, cwd) {
    const result = spawnSync(commandName, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) throw new Error("Git command failed");
    return result.stdout;
}

function requiredDirectory(directoryPath, errorMessage) {
    let stat;
    try {
        stat = fs.lstatSync(directoryPath);
    } catch {
        throw new Error(errorMessage);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(errorMessage);
    return fs.realpathSync.native(directoryPath);
}

function resolveSourceRoot(sourceRoot) {
    const resolvedSourceRoot = requiredDirectory(sourceRoot, "source must be a Git worktree root");
    let gitRoot;
    try {
        gitRoot = fs.realpathSync.native(
            command("git", ["rev-parse", "--show-toplevel"], resolvedSourceRoot).trim(),
        );
    } catch {
        throw new Error("source must be a Git worktree root");
    }
    if (gitRoot !== resolvedSourceRoot) throw new Error("source must be a Git worktree root");
    return resolvedSourceRoot;
}

function resolveFullRevision(sourceRoot, revision, label) {
    if (!/^[a-f0-9]{40}$/iu.test(revision)) throw new Error(`${label} must be a full Git revision`);
    let resolvedRevision;
    try {
        resolvedRevision = command(
            "git",
            ["rev-parse", "--verify", `${revision}^{commit}`],
            sourceRoot,
        ).trim();
    } catch {
        throw new Error(`${label} is unavailable`);
    }
    if (resolvedRevision !== revision) throw new Error(`${label} must resolve exactly`);
    return resolvedRevision;
}

function sourceHead(sourceRoot) {
    return resolveFullRevision(
        sourceRoot,
        command("git", ["rev-parse", "--verify", "HEAD^{commit}"], sourceRoot).trim(),
        "source HEAD",
    );
}

function regularBlobContents(sourceRoot, revision, sourcePath) {
    const entry = command(
        "git",
        ["ls-tree", "-z", "--full-tree", revision, "--", sourcePath],
        sourceRoot,
    );
    const records = entry.split("\0").filter(Boolean);
    if (records.length !== 1) throw new Error(`pinned source path is ambiguous: ${sourcePath}`);
    const [metadata, exactPath] = records[0].split("\t", 2);
    const [mode, type, objectID] = metadata?.split(" ") ?? [];
    if (
        exactPath !== sourcePath ||
        mode !== "100644" ||
        type !== "blob" ||
        !/^[a-f0-9]{40}$/iu.test(objectID)
    ) {
        throw new Error(`pinned source path must be a regular blob: ${sourcePath}`);
    }
    return command("git", ["cat-file", "blob", objectID], sourceRoot);
}

function copiedContents(sourcePath, contents) {
    if (sourcePath !== "contracts/openapi/acr-v1.json") return contents;
    return contents.replaceAll("../jsonschema/v1/", "../schemas/");
}

export function readPinnedSourceFiles({ sourceRoot, expectedCommit, sourceCommit, sourcePaths }) {
    const verifiedSourceRoot = resolveSourceRoot(sourceRoot);
    const pinnedCommit = resolveFullRevision(
        verifiedSourceRoot,
        sourceCommit,
        "pinned source commit",
    );
    const headCommit = sourceHead(verifiedSourceRoot);
    if (headCommit !== pinnedCommit) throw new Error(`source HEAD must equal ${sourceCommit}`);
    if (
        expectedCommit !== undefined &&
        resolveFullRevision(verifiedSourceRoot, expectedCommit, "expected commit") !== pinnedCommit
    ) {
        throw new Error(`expected commit must equal ${sourceCommit}`);
    }
    if (command("git", ["status", "--porcelain"], verifiedSourceRoot).trim() !== "") {
        throw new Error("source worktree must be clean");
    }
    const files = sourcePaths.map((file) => ({
        path: file,
        contents: copiedContents(file, regularBlobContents(verifiedSourceRoot, pinnedCommit, file)),
    }));
    if (sourceHead(verifiedSourceRoot) !== headCommit) {
        throw new Error("source HEAD changed while reading pinned files");
    }
    return files;
}

export function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

function parseArtifactPath(relativePath) {
    if (relativePath === "manifest.json") return { directory: undefined, file: relativePath };
    if (ARTIFACT_SIBLINGS.has(relativePath)) {
        return { directory: "..", file: path.basename(relativePath) };
    }
    const [directory, file, ...rest] = relativePath.split("/");
    if (
        rest.length !== 0 ||
        !ARTIFACT_DIRECTORIES.has(directory) ||
        file === undefined ||
        file === "" ||
        path.basename(file) !== file
    ) {
        throw new Error("unsafe artifact path");
    }
    return { directory, file };
}

function artifactRootDirectories(artifactRoot) {
    const root = requiredDirectory(artifactRoot, "unsafe artifact path");
    return { parent: requiredDirectory(path.dirname(root), "unsafe artifact path"), root };
}

function requireActiveLease(lease) {
    if (typeof lease !== "function" || typeof lease.assert !== "function") {
        throw new Error("active artifact lease is required");
    }
    return lease.assert();
}

function artifactDirectory(root, directory, create) {
    if (directory === undefined) return root;
    if (directory === "..") return requiredDirectory(path.dirname(root), "unsafe artifact path");
    const directoryPath = path.join(root, directory);
    if (!fs.existsSync(directoryPath) && create) fs.mkdirSync(directoryPath, { recursive: true });
    return requiredDirectory(directoryPath, "unsafe artifact path");
}

function artifactDestination(artifactRoot, relativePath, create) {
    const { parent, root } = artifactRootDirectories(artifactRoot);
    const parsed = parseArtifactPath(relativePath);
    const directory =
        parsed.directory === ".." ? parent : artifactDirectory(root, parsed.directory, create);
    const destination = path.join(directory, parsed.file);
    if (fs.existsSync(destination)) {
        const stat = fs.lstatSync(destination);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("unsafe artifact path");
    }
    return destination;
}

function fsyncDirectory(directoryPath) {
    const descriptor = fs.openSync(directoryPath, "r");
    try {
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
}

function stageArtifact(destination, contents) {
    const temporary = path.join(
        path.dirname(destination),
        `.${path.basename(destination)}.${randomUUID()}.tmp`,
    );
    const descriptor = fs.openSync(temporary, "wx", 0o600);
    try {
        fs.writeFileSync(descriptor, contents, "utf8");
        fs.fsyncSync(descriptor);
    } finally {
        fs.closeSync(descriptor);
    }
    return temporary;
}

export function writeArtifacts(lease, artifacts) {
    const artifactRoot = requireActiveLease(lease);
    const staged = [];
    const replaced = [];
    let preserveRecoveryArtifacts = false;
    let transactionError;
    try {
        for (const [relativePath, contents] of Object.entries(artifacts)) {
            requireActiveLease(lease);
            const destination = artifactDestination(artifactRoot, relativePath, true);
            staged.push({ destination, temporary: stageArtifact(destination, contents) });
        }
        for (const entry of staged) {
            requireActiveLease(lease);
            const backup = fs.existsSync(entry.destination)
                ? `${entry.destination}.${randomUUID()}.backup`
                : undefined;
            if (backup !== undefined) fs.linkSync(entry.destination, backup);
            const replacement = { backup, destination: entry.destination };
            replaced.push(replacement);
            fs.renameSync(entry.temporary, entry.destination);
            fsyncDirectory(path.dirname(entry.destination));
        }
    } catch (error) {
        const restorationErrors = [];
        for (const entry of replaced.toReversed()) {
            try {
                requireActiveLease(lease);
                if (entry.backup === undefined) fs.rmSync(entry.destination, { force: true });
                else fs.renameSync(entry.backup, entry.destination);
                fsyncDirectory(path.dirname(entry.destination));
            } catch (restorationError) {
                restorationErrors.push(restorationError);
            }
        }
        if (restorationErrors.length > 0) {
            preserveRecoveryArtifacts = true;
            transactionError = new AggregateError(
                [error, ...restorationErrors],
                "artifact transaction restoration failed",
            );
            throw transactionError;
        }
        transactionError = error;
        throw error;
    } finally {
        const cleanupErrors = [];
        for (const entry of staged) {
            try {
                requireActiveLease(lease);
                fs.rmSync(entry.temporary, { force: true });
            } catch (error) {
                cleanupErrors.push(error);
            }
        }
        if (!preserveRecoveryArtifacts) {
            for (const entry of replaced) {
                if (entry.backup !== undefined) {
                    try {
                        requireActiveLease(lease);
                        fs.rmSync(entry.backup, { force: true });
                    } catch (error) {
                        cleanupErrors.push(error);
                    }
                }
            }
        }
        if (cleanupErrors.length > 0) {
            throw new AggregateError(
                transactionError === undefined
                    ? cleanupErrors
                    : [transactionError, ...cleanupErrors],
                "artifact transaction cleanup failed",
            );
        }
    }
}

function processStartIdentity(pid) {
    const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
    return result.status === 0 && result.stdout.trim() !== "" ? result.stdout.trim() : undefined;
}

function lockMetadata(ownerToken) {
    return `${JSON.stringify({
        acquired_at: Date.now(),
        host_hash: sha256(hostname()),
        owner_token: ownerToken,
        pid: process.pid,
        process_start: processStartIdentity(process.pid),
        schema_version: "acr_contract_lock.v1",
    })}\n`;
}

function staleDeadLock(lockPath) {
    const stat = fs.lstatSync(lockPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("unsafe artifact generation lock");
    let metadata;
    try {
        metadata = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    } catch {
        return false;
    }
    if (
        metadata?.schema_version !== "acr_contract_lock.v1" ||
        metadata.host_hash !== sha256(hostname()) ||
        typeof metadata.owner_token !== "string" ||
        !/^[0-9a-f-]{36}$/iu.test(metadata.owner_token) ||
        typeof metadata?.acquired_at !== "number" ||
        !Number.isSafeInteger(metadata.acquired_at) ||
        typeof metadata?.pid !== "number" ||
        !Number.isSafeInteger(metadata.pid) ||
        metadata.pid <= 0 ||
        typeof metadata.process_start !== "string" ||
        metadata.process_start === ""
    ) {
        return false;
    }
    try {
        process.kill(metadata.pid, 0);
    } catch (error) {
        return error instanceof Error && "code" in error && error.code === "ESRCH";
    }
    const currentStart = processStartIdentity(metadata.pid);
    if (currentStart === undefined) {
        return false;
    }
    return currentStart !== metadata.process_start;
}

function acquireArtifactLease(lockPath, root) {
    const ownerToken = randomUUID();
    const temporary = `${lockPath}.${ownerToken}.tmp`;
    const temporaryDescriptor = fs.openSync(temporary, "wx", 0o600);
    try {
        fs.writeFileSync(temporaryDescriptor, lockMetadata(ownerToken), "utf8");
        fs.fsyncSync(temporaryDescriptor);
    } finally {
        fs.closeSync(temporaryDescriptor);
    }
    try {
        fs.linkSync(temporary, lockPath);
    } finally {
        fs.rmSync(temporary, { force: true });
    }
    fsyncDirectory(root);
    const descriptor = fs.openSync(lockPath, "r");
    const lockStat = fs.fstatSync(descriptor);
    const lease = () => {
        try {
            lease.assert();
            fs.rmSync(lockPath, { force: true });
            fsyncDirectory(root);
        } finally {
            fs.closeSync(descriptor);
        }
    };
    lease.assert = () => {
        const current = fs.statSync(lockPath);
        if (current.dev !== lockStat.dev || current.ino !== lockStat.ino) {
            throw new Error("active artifact lease was replaced");
        }
        const metadata = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        if (
            metadata.schema_version !== "acr_contract_lock.v1" ||
            metadata.owner_token !== ownerToken ||
            metadata.host_hash !== sha256(hostname()) ||
            metadata.pid !== process.pid ||
            metadata.process_start !== processStartIdentity(process.pid) ||
            !Number.isSafeInteger(metadata.acquired_at) ||
            (current.mode & 0o777) !== 0o600
        ) {
            throw new Error("active artifact lease is invalid");
        }
        return root;
    };
    return lease;
}

function recoveryInProgress(recoveryPath, root) {
    try {
        const stat = fs.lstatSync(recoveryPath);
        if (!stat.isFile() || stat.isSymbolicLink()) {
            throw new Error("unsafe artifact generation recovery lock");
        }
        if (staleDeadLock(recoveryPath)) {
            fs.rmSync(recoveryPath);
            fsyncDirectory(root);
            return false;
        }
        return true;
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
        throw error;
    }
}

function recoverDeadLock(lockPath, recoveryPath, root) {
    let releaseRecovery;
    try {
        releaseRecovery = acquireArtifactLease(recoveryPath, root);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "EEXIST") return false;
        throw error;
    }
    try {
        try {
            if (!staleDeadLock(lockPath)) return false;
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
            throw error;
        }
        fs.rmSync(lockPath);
        fsyncDirectory(root);
        return true;
    } finally {
        releaseRecovery();
    }
}

/**
 * `timeoutMillis` exists so a caller can bound its own wait against the REAL
 * clock (CHAOS-3341). The test that proves this wait is bounded used to script
 * `Date.now` with `vi.spyOn(Date, "now").mockReturnValueOnce(0)` instead —
 * scripting a process-wide global, where anything else reading the clock
 * between the spy and the first read below silently consumes the once-value.
 * Losing it puts `deadline` a full timeout beyond every later reading, so this
 * loop never terminates; and because the loop is synchronous, no test timeout
 * can interrupt it — the whole file hangs. Injecting the bound removes the
 * global mutation rather than re-scoping it.
 */
export function acquireArtifactLock(artifactRoot, { timeoutMillis = LOCK_TIMEOUT_MILLIS } = {}) {
    const { root } = artifactRootDirectories(artifactRoot);
    const lockPath = path.join(root, ".acr-contract-sync.lock");
    const recoveryPath = `${lockPath}.recovery`;
    const deadline = Date.now() + timeoutMillis;
    while (true) {
        if (recoveryInProgress(recoveryPath, root)) {
            if (Date.now() >= deadline) throw new Error("artifact generation lock timed out");
            Atomics.wait(LOCK_WAIT_STATE, 0, 0, LOCK_WAIT_MILLIS);
            continue;
        }
        try {
            return acquireArtifactLease(lockPath, root);
        } catch (error) {
            if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST")
                throw error;
            if (recoverDeadLock(lockPath, recoveryPath, root)) continue;
            if (Date.now() >= deadline) throw new Error("artifact generation lock timed out");
            Atomics.wait(LOCK_WAIT_STATE, 0, 0, LOCK_WAIT_MILLIS);
        }
    }
}

export function removeStaleArtifacts(lease, expectedPaths) {
    const artifactRoot = requireActiveLease(lease);
    const { root } = artifactRootDirectories(artifactRoot);
    for (const directory of ARTIFACT_DIRECTORIES) {
        const directoryPath = artifactDirectory(root, directory, false);
        for (const entry of fs.readdirSync(directoryPath)) {
            const relativePath = `${directory}/${entry}`;
            if (expectedPaths.has(relativePath)) continue;
            requireActiveLease(lease);
            fs.rmSync(artifactDestination(root, relativePath, false));
            fsyncDirectory(directoryPath);
        }
    }
}

export function currentArtifacts(lease, sourceCommit) {
    const artifactRoot = requireActiveLease(lease);
    const manifestPath = artifactDestination(artifactRoot, "manifest.json", false);
    if (!fs.existsSync(manifestPath)) throw new Error("committed artifacts are missing");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.source_commit !== sourceCommit || !Array.isArray(manifest.files)) {
        throw new Error("manifest is invalid");
    }
    return manifest.files.map((file) => {
        requireActiveLease(lease);
        if (typeof file.path !== "string" || typeof file.sha256 !== "string") {
            throw new Error("manifest entry is invalid");
        }
        const contents = fs.readFileSync(
            artifactDestination(artifactRoot, file.path, false),
            "utf8",
        );
        if (sha256(contents) !== file.sha256) throw new Error(`digest drift: ${file.path}`);
        const prefix = file.path.startsWith("schemas/")
            ? "contracts/jsonschema/v1/"
            : file.path.startsWith("openapi/")
              ? "contracts/openapi/"
              : "contracts/examples/v1/";
        return { path: `${prefix}${path.basename(file.path)}`, contents };
    });
}

export function assertCurrent(lease, artifacts) {
    const artifactRoot = requireActiveLease(lease);
    for (const [relativePath, expected] of Object.entries(artifacts)) {
        requireActiveLease(lease);
        const destination = artifactDestination(artifactRoot, relativePath, false);
        if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== expected) {
            throw new Error(`artifact drift: ${relativePath}`);
        }
    }
}
