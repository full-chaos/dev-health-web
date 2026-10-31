import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as hashModule from "../hash";
import { hashIdentifier } from "../hash";

// The ops read side joins on sha256(org id) in lowercase hex (queryapi OrgHash).
const OPS_ORG_HASH_VECTOR = "org-123";
const OPS_ORG_HASH_HEX = "83e582565905f7e5bc0074cd776abd13d7ca413991011906c51d96696b92c199";

describe("hashIdentifier", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("produces a lowercase SHA-256 hex digest when SubtleCrypto is available", async () => {
        const hashed = await hashIdentifier(OPS_ORG_HASH_VECTOR);
        expect(hashed).toMatch(/^[0-9a-f]{64}$/);
        const expected = Array.from(
            new Uint8Array(
                await globalThis.crypto.subtle.digest(
                    "SHA-256",
                    new TextEncoder().encode(OPS_ORG_HASH_VECTOR),
                ),
            ),
        )
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        expect(hashed).toBe(expected);
        expect(hashed).toBe(OPS_ORG_HASH_HEX);
    });

    it("is deterministic and distinguishes inputs", async () => {
        expect(await hashIdentifier("org-123")).toBe(await hashIdentifier("org-123"));
        expect(await hashIdentifier("org-1")).not.toBe(await hashIdentifier("org-2"));
    });

    it("returns null without SubtleCrypto and makes no other hash", async () => {
        vi.stubGlobal("crypto", {});
        expect(await hashIdentifier("org-123")).toBeNull();
    });

    it("no longer exports the 32-bit fallback", () => {
        expect(Object.keys(hashModule)).toEqual(["hashIdentifier"]);
    });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
            if (entry === "__tests__" || entry === "node_modules") continue;
            sourceFiles(path, out);
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
            out.push(path);
        }
    }
    return out;
}

describe("no weak identifier hash in the telemetry code", () => {
    it("has no fnv1a string in the telemetry or onboarding sources", () => {
        const roots = ["src/lib/telemetry", "src/lib/onboarding", "src/components/telemetry"];
        const hits = roots
            .flatMap((root) => sourceFiles(join(process.cwd(), root)))
            .filter((file) => /fnv1a|fallbackHash/i.test(readFileSync(file, "utf8")));
        expect(hits).toEqual([]);
        expect(
            roots.flatMap((root) => sourceFiles(join(process.cwd(), root))).length,
        ).toBeGreaterThan(10);
    });
});
