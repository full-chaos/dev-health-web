/**
 * CHAOS-9070: ci/ci-images.json is the ONE source of truth for the digests of node and traefik.
 * Ops-owned refs (the org buildkit mirror) are pinned in build-docker.yml and allowed by name below. This fails when a place disagrees with it:
 *  - the Dockerfile `ARG NODE_IMAGE=` default (the only other literal, it cannot read a file);
 *  - any workflow that carries one of the digests as a literal instead of reading the file;
 *  - a consumer that stops reading the file or the mirror job that stops triggering on it.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { dockerfileNodeDefault, parsePins, upstreamRef } from "../bump-ci-images.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => readFileSync(path.join(ROOT, ...p), "utf8");
const WORKFLOWS = path.join(ROOT, ".github", "workflows");
const workflowFiles = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f));

// Owned by ops (org-wide public mirror); pinned by digest, NOT bumped by the web script.
const OPS_OWNED_BUILDKIT =
    "ghcr.io/full-chaos/moby/buildkit:buildx-stable-1@sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea";

const pins = parsePins(read("ci", "ci-images.json"));
const digests = Object.values(pins.images).map((i) => i.digest);

describe("CI image pins agree (ci/ci-images.json is the source)", () => {
    it("has the web-owned mirrored images (buildkit is ops-owned)", () => {
        expect(Object.keys(pins.images).sort()).toEqual(["node", "traefik"]);
    });

    it("the Dockerfile NODE_IMAGE default is the pinned upstream ref", () => {
        expect(dockerfileNodeDefault(read("Dockerfile"))).toBe(upstreamRef(pins, "node"));
    });

    it("the Dockerfile carries no other digest literal", () => {
        const found = read("Dockerfile").match(/sha256:[0-9a-f]{64}/g) ?? [];
        expect(found).toEqual([pins.images.node.digest]);
    });

    for (const f of workflowFiles) {
        it(`${f} holds no literal digest of a pinned image`, () => {
            const text = readFileSync(path.join(WORKFLOWS, f), "utf8");
            for (const d of digests) expect(text.includes(d), `${f} repeats ${d}`).toBe(false);
        });
    }

    it("the mirror job reads source and mirror refs from the file and triggers on it", () => {
        const text = readFileSync(path.join(WORKFLOWS, "mirror-ci-images.yml"), "utf8");
        expect(text).toContain("scripts/bump-ci-images.mjs --ref");
        for (const name of Object.keys(pins.images)) expect(text).toContain(name);
        expect(text.match(/- 'ci\/ci-images\.json'/g)?.length).toBeGreaterThanOrEqual(2);
        expect(text).not.toMatch(/mirror\.gcr\.io\/\S+@sha256/);
    });

    it("build-docker reads the node mirror ref from the file", () => {
        const text = readFileSync(path.join(WORKFLOWS, "build-docker.yml"), "utf8");
        expect(text).toContain("--ref node mirror");
        expect(text).toContain("NODE_IMAGE=${{ steps.pins.outputs.node }}");
        expect(text).toContain("'ci/ci-images.json'");
    });

    it("build-docker pins the ops-owned org buildkit mirror, in both jobs, and the web copy is unused", () => {
        const text = readFileSync(path.join(WORKFLOWS, "build-docker.yml"), "utf8");
        expect(text.split(`driver-opts: image=${OPS_OWNED_BUILDKIT}`).length - 1).toBe(2);
        expect(text.match(/driver-opts: image=/g)).toHaveLength(2);
        expect(text).not.toContain("dev-health-web/moby/buildkit");
    });

    it("live-e2e reads the traefik mirror ref from the file", () => {
        const text = readFileSync(path.join(WORKFLOWS, "live-e2e.yml"), "utf8");
        expect(text).toContain("--ref traefik mirror");
        expect(text).toContain('"${traefik_image}"');
        expect(text).not.toMatch(/dev-health-web\/traefik/);
    });

    it("consumers wait for the mirror, and never fall back to Docker Hub", () => {
        const script = read(".github/scripts/wait-for-ci-images.sh");
        expect(script).toContain("exit 1");
        expect(script).not.toMatch(/docker\.io|docker pull/);
    });
});
