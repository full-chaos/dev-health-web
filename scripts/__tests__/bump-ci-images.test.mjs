import { describe, expect, it } from "vitest";

import {
    applyDigests,
    compare,
    dockerfileNodeDefault,
    exitCode,
    formatRows,
    lookupDigest,
    mirrorRef,
    parsePins,
    setDockerfileNodeDefault,
    sourceRef,
    upstreamRef,
} from "../bump-ci-images.mjs";

const D1 = "sha256:" + "a".repeat(64);
const D2 = "sha256:" + "b".repeat(64);
const D3 = "sha256:" + "c".repeat(64);
const D4 = "sha256:" + "d".repeat(64);

const PINS = JSON.stringify({
    mirrorPrefix: "ghcr.io/o/p",
    sourceRegistry: "mirror.example",
    images: {
        node: { repo: "library/node", dest: "node", tag: "25-alpine", digest: D1 },
        buildkit: { repo: "moby/buildkit", dest: "moby/buildkit", tag: "x", digest: D2 },
    },
});
const DOCKERFILE = `# c\nARG NODE_IMAGE=node:25-alpine@${D1}\n\nFROM \${NODE_IMAGE} AS deps\n`;

describe("refs", () => {
    const pins = parsePins(PINS);
    it("builds the three forms", () => {
        expect(sourceRef(pins, "node")).toBe(`mirror.example/library/node:25-alpine@${D1}`);
        expect(mirrorRef(pins, "buildkit")).toBe(`ghcr.io/o/p/moby/buildkit:x@${D2}`);
        expect(upstreamRef(pins, "node")).toBe(`node:25-alpine@${D1}`);
    });
    it("rejects a bad digest or a missing field", () => {
        expect(() => parsePins(PINS.replace(D1, "sha256:zz"))).toThrow(/digest/);
        expect(() => parsePins(JSON.stringify({ mirrorPrefix: "x" }))).toThrow();
    });
});

describe("edit of both files", () => {
    it("moves JSON and Dockerfile together", () => {
        const out = applyDigests(PINS, DOCKERFILE, { node: D3, buildkit: D4 });
        const pins = parsePins(out.pinsText);
        expect(pins.images.node.digest).toBe(D3);
        expect(pins.images.buildkit.digest).toBe(D4);
        expect(dockerfileNodeDefault(out.dockerfile)).toBe(`node:25-alpine@${D3}`);
        expect(out.dockerfile).toContain("FROM ${NODE_IMAGE} AS deps");
    });
    it("fails on a Dockerfile without the ARG, an unknown name or a bad digest", () => {
        expect(() => setDockerfileNodeDefault("FROM x\n", "y")).toThrow();
        expect(() => applyDigests(PINS, DOCKERFILE, { nope: D3 })).toThrow();
        expect(() => applyDigests(PINS, DOCKERFILE, { node: "latest" })).toThrow();
    });
});

describe("report and exit codes", () => {
    const pins = parsePins(PINS);
    it("0 when current", () => {
        const rows = compare(pins, { node: D1, buildkit: D2 });
        expect(exitCode(rows, false)).toBe(0);
    });
    it("1 when behind, and prints name current -> upstream", () => {
        const rows = compare(pins, { node: D3, buildkit: D2 });
        expect(exitCode(rows, false)).toBe(1);
        expect(formatRows(rows)).toContain(`node ${D1} -> ${D3}  BEHIND`);
    });
    it("2 on a lookup error even if every other row is current", () => {
        const rows = compare(pins, { node: D1, buildkit: "LOOKUP-FAILED" });
        expect(exitCode(rows, true)).toBe(2);
    });
});

describe("lookupDigest", () => {
    const pins = parsePins(PINS);
    const ok = (digest) => async () => ({
        ok: true,
        status: 200,
        headers: new Map([["docker-content-digest", digest]]),
    });
    it("reads the digest header", async () => {
        expect(await lookupDigest(pins, "node", ok(D3))).toBe(D3);
    });
    it("throws on HTTP error or a missing header", async () => {
        await expect(
            lookupDigest(pins, "node", async () => ({ ok: false, status: 429 })),
        ).rejects.toThrow(/429/);
        await expect(lookupDigest(pins, "node", ok(undefined))).rejects.toThrow(
            /docker-content-digest/,
        );
    });
});
