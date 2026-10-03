import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-8150: orange (--accent) marks the current selection; the keyboard focus ring and the
 * focus border use the action teal (--accent-2), as the prototype does (style.css: `outline:2px
 * solid var(--blueInk)`). This scan fails on a focus-state class that uses the bare --accent token.
 */
const SRC = join(process.cwd(), "src");
// Both spellings of the token: `-(--accent)` and `-[var(--accent)]`; also `group-` / `peer-` prefixes.
const ORANGE_FOCUS =
    /(?:^|[\s"'`:])(?:[a-z-]+:)*(?:(?:group|peer)-)?(?:focus|focus-visible|focus-within):(?:ring|border|outline)(?:-[0-9a-z]+)?-(?:\(--accent\)|\[var\(--accent\)\])(?![\w-])/gu;

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__generated__") continue;
            walk(full, out);
        } else if (/\.(ts|tsx)$/u.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

function orangeFocusHits(text: string): string[] {
    return text.match(ORANGE_FOCUS) ?? [];
}

describe("focus ring colour", () => {
    it("flags a bare --accent focus class (including an opacity suffix)", () => {
        expect(orangeFocusHits('class="focus:ring-(--accent)"')).toHaveLength(1);
        expect(orangeFocusHits("focus-visible:ring-(--accent)/50")).toHaveLength(1);
        expect(orangeFocusHits("focus:border-(--accent) x")).toHaveLength(1);
        expect(orangeFocusHits("focus-visible:outline-(--accent)")).toHaveLength(1);
        expect(orangeFocusHits('className="x focus:ring-[var(--accent)]"')).toHaveLength(1);
        expect(orangeFocusHits("focus:border-[var(--accent)]/50")).toHaveLength(1);
        expect(orangeFocusHits("group-focus-visible:ring-(--accent)")).toHaveLength(1);
        expect(orangeFocusHits("peer-focus:ring-[var(--accent)]")).toHaveLength(1);
    });

    it("accepts the action teal and other accent tokens", () => {
        expect(orangeFocusHits("focus:ring-(--accent-2)")).toHaveLength(0);
        expect(orangeFocusHits("focus-visible:ring-(--accent-2)/60")).toHaveLength(0);
        expect(orangeFocusHits("focus:border-(--accent-positive)")).toHaveLength(0);
        expect(orangeFocusHits("hover:border-(--accent)")).toHaveLength(0);
        expect(orangeFocusHits("focus:ring-[var(--accent-2)]")).toHaveLength(0);
    });

    it("no source file sets an orange focus ring or focus border", () => {
        const bad: string[] = [];
        for (const file of walk(SRC)) {
            if (/\.test\./u.test(file)) continue;
            const hits = orangeFocusHits(readFileSync(file, "utf8"));
            if (hits.length > 0) bad.push(`${relative(SRC, file)}: ${hits.length}`);
        }
        expect(bad).toEqual([]);
    });
});
