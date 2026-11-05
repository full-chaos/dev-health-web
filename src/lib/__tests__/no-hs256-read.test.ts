import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

// RED-6. The HS256 read is gone from source: no class setting, no decode of an HS256 token. The only
// files that still name the retired setting are the tests that prove a leftover value changes nothing.
const root = path.resolve(__dirname, "../../..");
const NAMING_THE_RETIRED_SETTING = [
    "no-hs256-read.test.ts",
    "eddsaOnly.test.ts",
    "authSso.verify.test.ts",
];
const FORBIDDEN = ["hs256_compat", "decodeHs256", "AUTH_ACCESS_TOKEN_CLASS", "resolveTokenClass"];

function trackedHits(needle: string): string[] {
    try {
        return execFileSync("git", ["grep", "-lF", needle, "--", "src"], {
            cwd: root,
            encoding: "utf8",
        })
            .split("\n")
            .filter(
                (line) => line !== "" && !NAMING_THE_RETIRED_SETTING.some((f) => line.endsWith(f)),
            );
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
