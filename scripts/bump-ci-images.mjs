#!/usr/bin/env node
/**
 * CI image pins (CHAOS-9070). `ci/ci-images.json` is the ONE source of truth for the digests of the
 * images web CI mirrors to ghcr.io (node, traefik; buildkit is the ops-owned org mirror, pinned in build-docker.yml). Workflows read it through
 * `--ref`; the Dockerfile ARG default cannot read a file, so `--write` edits both together and
 * `scripts/__tests__/ci-image-pins.test.mjs` fails when they disagree.
 *
 *   node scripts/bump-ci-images.mjs                  report: `name current -> upstream`
 *                                                    exit 0 all current, 1 some behind, 2 lookup error
 *   node scripts/bump-ci-images.mjs --write          also edit ci/ci-images.json and the Dockerfile
 *   node scripts/bump-ci-images.mjs --ref <name> <mirror|source|upstream>
 *                                                    print one pinned ref for a workflow
 *
 * A lookup that did not happen is exit 2, never "current".
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PINS_PATH = path.join(ROOT, "ci", "ci-images.json");
const DOCKERFILE_PATH = path.join(ROOT, "Dockerfile");

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const ACCEPT = [
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

export function parsePins(text) {
    const pins = JSON.parse(text);
    if (!pins.mirrorPrefix || !pins.sourceRegistry || !pins.images) {
        throw new Error("ci-images.json: mirrorPrefix, sourceRegistry and images are required");
    }
    for (const [name, img] of Object.entries(pins.images)) {
        for (const k of ["repo", "dest", "tag", "digest"]) {
            if (!img[k]) throw new Error(`ci-images.json: ${name}.${k} is missing`);
        }
        if (!DIGEST_RE.test(img.digest)) {
            throw new Error(`ci-images.json: ${name}.digest is not a sha256 digest`);
        }
    }
    return pins;
}

/** Pull-through source the mirror job copies from. */
export function sourceRef(pins, name) {
    const i = pins.images[name];
    return `${pins.sourceRegistry}/${i.repo}:${i.tag}@${i.digest}`;
}

/** The ref CI consumers pull. */
export function mirrorRef(pins, name) {
    const i = pins.images[name];
    return `${pins.mirrorPrefix}/${i.dest}:${i.tag}@${i.digest}`;
}

/** Docker Hub style ref, as written in the Dockerfile ARG default. */
export function upstreamRef(pins, name) {
    const i = pins.images[name];
    return `${i.repo.replace(/^library\//, "")}:${i.tag}@${i.digest}`;
}

const NODE_ARG_RE = /^(ARG NODE_IMAGE=)(\S+)$/m;

export function dockerfileNodeDefault(dockerfile) {
    const m = NODE_ARG_RE.exec(dockerfile);
    return m ? m[2] : null;
}

export function setDockerfileNodeDefault(dockerfile, ref) {
    if (!NODE_ARG_RE.test(dockerfile)) throw new Error("Dockerfile: no `ARG NODE_IMAGE=` line");
    return dockerfile.replace(NODE_ARG_RE, `$1${ref}`);
}

/** Apply new digests ({name: digest}) to the pins text and the Dockerfile text. */
export function applyDigests(pinsText, dockerfile, digests) {
    const pins = parsePins(pinsText);
    for (const [name, digest] of Object.entries(digests)) {
        if (!pins.images[name]) throw new Error(`unknown image ${name}`);
        if (!DIGEST_RE.test(digest)) throw new Error(`bad digest for ${name}`);
        pins.images[name].digest = digest;
    }
    return {
        pinsText: JSON.stringify(pins, null, 4) + "\n",
        dockerfile: setDockerfileNodeDefault(dockerfile, upstreamRef(pins, "node")),
    };
}

/** Compare current pins with looked-up digests. */
export function compare(pins, upstream) {
    return Object.entries(pins.images).map(([name, img]) => ({
        name,
        current: img.digest,
        upstream: upstream[name],
        behind: upstream[name] !== img.digest,
    }));
}

export function exitCode(rows, hadError) {
    if (hadError) return 2;
    return rows.some((r) => r.behind) ? 1 : 0;
}

export function formatRows(rows) {
    return rows
        .map((r) => `${r.name} ${r.current} -> ${r.upstream}${r.behind ? "  BEHIND" : "  current"}`)
        .join("\n");
}

/** Index digest of a tag from the pull-through registry (HEAD manifest). */
export async function lookupDigest(pins, name, fetchImpl = fetch) {
    const i = pins.images[name];
    const url = `https://${pins.sourceRegistry}/v2/${i.repo}/manifests/${i.tag}`;
    const res = await fetchImpl(url, { method: "HEAD", headers: { Accept: ACCEPT } });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status} from ${url}`);
    const digest = res.headers.get("docker-content-digest");
    if (!digest || !DIGEST_RE.test(digest))
        throw new Error(`${name}: no valid docker-content-digest from ${url}`);
    return digest;
}

export async function main(argv, io = { log: console.log, err: console.error }, fetchImpl = fetch) {
    const pins = parsePins(readFileSync(PINS_PATH, "utf8"));
    if (argv[0] === "--ref") {
        const [, name, kind] = argv;
        const fn = { mirror: mirrorRef, source: sourceRef, upstream: upstreamRef }[kind];
        if (!pins.images[name] || !fn) {
            io.err("usage: --ref <node|traefik> <mirror|source|upstream>");
            return 2;
        }
        io.log(fn(pins, name));
        return 0;
    }
    const write = argv.includes("--write");
    const upstream = {};
    let hadError = false;
    for (const name of Object.keys(pins.images)) {
        try {
            upstream[name] = await lookupDigest(pins, name, fetchImpl);
        } catch (e) {
            hadError = true;
            upstream[name] = "LOOKUP-FAILED";
            io.err(String(e.message ?? e));
        }
    }
    const rows = compare(pins, upstream);
    io.log(formatRows(rows));
    if (write && !hadError && rows.some((r) => r.behind)) {
        const digests = Object.fromEntries(rows.map((r) => [r.name, r.upstream]));
        const out = applyDigests(
            readFileSync(PINS_PATH, "utf8"),
            readFileSync(DOCKERFILE_PATH, "utf8"),
            digests,
        );
        writeFileSync(PINS_PATH, out.pinsText);
        writeFileSync(DOCKERFILE_PATH, out.dockerfile);
        io.log("wrote ci/ci-images.json and Dockerfile");
    }
    return exitCode(rows, hadError);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).then((c) => process.exit(c));
}
