import { describe, expect, it } from "vitest";

import { rawWordsIn } from "@/test/rawWords";

const RAW = /\b(complete|partial|degraded)\b/iu;

function node(html: string): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = html;
    return root;
}

describe("rawWordsIn (CHAOS-12312)", () => {
    it("finds a word that textContent glues to its neighbour, where a word boundary misses it", () => {
        const glued = node(
            "<span>Teambeta: </span><span>degraded</span><span>window current</span>",
        );
        expect(glued.textContent).not.toMatch(RAW);
        expect(rawWordsIn(glued, RAW)).toEqual(["degraded"]);
    });

    it("finds a word in aria-label, title or alt", () => {
        expect(rawWordsIn(node('<span aria-label="partial">x</span>'), RAW)).toEqual(["partial"]);
        expect(rawWordsIn(node('<abbr title="Complete">C</abbr>'), RAW)).toEqual(["Complete"]);
        expect(rawWordsIn(node('<img alt="degraded" />'), RAW)).toEqual(["degraded"]);
    });

    it("still reads the whole text, for a phrase that spans nodes", () => {
        const phrase = /needed was read/u;
        expect(rawWordsIn(node("<span>needed </span><span>was read</span>"), phrase)).toEqual([
            "needed was read",
        ]);
    });

    it("finds nothing in clean text, and is not fooled by a global flag", () => {
        expect(rawWordsIn(node("<p>Missing data: health read in part.</p>"), RAW)).toEqual([]);
        const global = /\bpartial\b/gu;
        const root = node("<span>partial</span>");
        expect(rawWordsIn(root, global)).toEqual(["partial", "partial"]);
        expect(rawWordsIn(root, global)).toEqual(["partial", "partial"]);
    });
});
