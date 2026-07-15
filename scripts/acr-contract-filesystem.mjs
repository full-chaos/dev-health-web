import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ARTIFACT_DIRECTORIES = new Set(["examples", "openapi", "schemas"]);
const ARTIFACT_SIBLINGS = new Set(["../contracts.ts", "../generated.ts"]);
const LOCK_WAIT_MILLIS = 10;
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
    const headCommit = resolveFullRevision(
        verifiedSourceRoot,
        command("git", ["rev-parse", "--verify", "HEAD^{commit}"], verifiedSourceRoot).trim(),
        "source HEAD",
    );
    if (headCommit !== pinnedCommit) throw new Error(`source HEAD must equal ${sourceCommit}`);
    if (
        expectedCommit !== undefined &&
        resolveFullRevision(verifiedSourceRoot, expectedCommit, "expected commit") !== pinnedCommit
    ) {
        throw new Error(`expected commit must equal ${sourceCommit}`);
    }
    if (
        command(
            "git",
            ["status", "--porcelain", "--untracked-files=no"],
            verifiedSourceRoot,
        ).trim() !== ""
    ) {
        throw new Error("source worktree must be clean");
    }
    return sourcePaths.map((file) => ({
        path: file,
        contents: copiedContents(
            file,
            command("git", ["show", `${pinnedCommit}:${file}`], verifiedSourceRoot),
        ),
    }));
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

export function writeArtifacts(artifactRoot, artifacts) {
    const staged = [];
    const replaced = [];
    try {
        for (const [relativePath, contents] of Object.entries(artifacts)) {
            const destination = artifactDestination(artifactRoot, relativePath, true);
            staged.push({ destination, temporary: stageArtifact(destination, contents) });
        }
        for (const entry of staged) {
            const backup = fs.existsSync(entry.destination)
                ? `${entry.destination}.${randomUUID()}.backup`
                : undefined;
            if (backup !== undefined) fs.linkSync(entry.destination, backup);
            fs.renameSync(entry.temporary, entry.destination);
            fsyncDirectory(path.dirname(entry.destination));
            replaced.push({ backup, destination: entry.destination });
        }
    } catch (error) {
        for (const entry of replaced.toReversed()) {
            if (entry.backup === undefined) fs.rmSync(entry.destination, { force: true });
            else fs.renameSync(entry.backup, entry.destination);
            fsyncDirectory(path.dirname(entry.destination));
        }
        throw error;
    } finally {
        for (const entry of staged) fs.rmSync(entry.temporary, { force: true });
        for (const entry of replaced) {
            if (entry.backup !== undefined) fs.rmSync(entry.backup, { force: true });
        }
    }
}

export function acquireArtifactLock(artifactRoot) {
    const { root } = artifactRootDirectories(artifactRoot);
    const lockPath = path.join(root, ".acr-contract-sync.lock");
    const deadline = Date.now() + 30_000;
    while (true) {
        try {
            const descriptor = fs.openSync(lockPath, "wx", 0o600);
            return () => {
                fs.closeSync(descriptor);
                fs.rmSync(lockPath, { force: true });
            };
        } catch (error) {
            if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST")
                throw error;
            if (Date.now() >= deadline) throw new Error("artifact generation lock timed out");
            Atomics.wait(LOCK_WAIT_STATE, 0, 0, LOCK_WAIT_MILLIS);
        }
    }
}

export function removeStaleArtifacts(artifactRoot, expectedPaths) {
    const { root } = artifactRootDirectories(artifactRoot);
    for (const directory of ARTIFACT_DIRECTORIES) {
        const directoryPath = artifactDirectory(root, directory, false);
        for (const entry of fs.readdirSync(directoryPath)) {
            const relativePath = `${directory}/${entry}`;
            if (expectedPaths.has(relativePath)) continue;
            fs.rmSync(artifactDestination(root, relativePath, false));
            fsyncDirectory(directoryPath);
        }
    }
}

export function currentArtifacts(artifactRoot, sourceCommit) {
    const manifestPath = artifactDestination(artifactRoot, "manifest.json", false);
    if (!fs.existsSync(manifestPath)) throw new Error("committed artifacts are missing");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.source_commit !== sourceCommit || !Array.isArray(manifest.files)) {
        throw new Error("manifest is invalid");
    }
    return manifest.files.map((file) => {
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

export function assertCurrent(artifactRoot, artifacts) {
    for (const [relativePath, expected] of Object.entries(artifacts)) {
        const destination = artifactDestination(artifactRoot, relativePath, false);
        if (!fs.existsSync(destination) || fs.readFileSync(destination, "utf8") !== expected) {
            throw new Error(`artifact drift: ${relativePath}`);
        }
    }
}
