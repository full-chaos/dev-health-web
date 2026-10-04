import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// CHAOS-8585: the Python CLI (`dev-hops`) and its image are removed (ops #3761); the Go binary is
// `dho`. No product text under src/ and no README line may tell a user to run the old CLI. The
// only allowed tokens are the stored producer value `dev-hops-cli` (data written by old clients)
// and the prefix check that classifies it in producer.ts. Test files are skipped: they name the old CLI to assert its absence.

const ROOT = process.cwd();
// Stored producer values: the exact value, and the prefix check that classifies it (producer.ts).
const ALLOWED = ["dev-hops-cli", 'startsWith("dev-hops")'];

const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(ts|tsx|md|mdx)$/u.test(name) && !/\.test\.[jt]sx?$/u.test(name))
            out.push(full);
    }
    return out;
};

const offenders = (files: string[]) =>
    files.flatMap((file) =>
        readFileSync(file, "utf8")
            .split("\n")
            .map((line, index) => ({
                file: path.relative(ROOT, file),
                line: index + 1,
                text: line,
            }))
            .filter(({ text }) =>
                ALLOWED.reduce((rest, token) => rest.split(token).join(""), text).includes(
                    "dev-hops",
                ),
            ),
    );

describe("no text tells a user to run the removed Python CLI", () => {
    it("scans a real set of files (a scan that reads nothing must fail)", () => {
        const files = walk(path.join(ROOT, "src"));
        expect(files.length).toBeGreaterThan(200);
        expect(files.some((f) => f.endsWith(path.join("customer-push", "examples.ts")))).toBe(true);
    });

    it("src/ has no `dev-hops` outside the producer value", () => {
        expect(offenders(walk(path.join(ROOT, "src")))).toEqual([]);
    });

    it("README.md has no `dev-hops`", () => {
        expect(offenders([path.join(ROOT, "README.md")])).toEqual([]);
    });

    it("the producer value stays allowed (the scan is not a blanket ban on the token)", () => {
        const producer = readFileSync(path.join(ROOT, "src/lib/customer-push/producer.ts"), "utf8");
        expect(producer).toContain("dev-hops");
        expect(offenders([path.join(ROOT, "src/lib/customer-push/producer.ts")])).toEqual([]);
    });
});
