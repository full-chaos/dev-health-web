import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// RED-6. The HS256 read is gone from source: no class setting, no decode of an HS256 token. A test
// may name HS256 only as the refused algorithm.
const root = path.resolve(__dirname, "../../..");
const FORBIDDEN = ["hs256_compat", "decodeHs256", "AUTH_ACCESS_TOKEN_CLASS", "resolveTokenClass"];

function trackedHits(needle: string): string[] {
    try {
        return execFileSync("git", ["grep", "-lF", needle, "--", "src"], {
            cwd: root,
            encoding: "utf8",
        })
            .split("\n")
            .filter((line) => line !== "" && !line.endsWith("no-hs256-read.test.ts"));
    } catch (error) {
        if ((error as { status?: number }).status === 1) return [];
        throw error;
    }
}

describe("no HS256 read in web source", () => {
    it.each(FORBIDDEN)("src/ does not contain %s", (needle) => {
        expect(trackedHits(needle)).toEqual([]);
    });
});
