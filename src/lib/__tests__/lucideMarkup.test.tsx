import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { describe, expect, it } from "vitest";

import { normalizeLucideSvgs } from "@/test/lucideMarkup";

const norm = (el: ReturnType<typeof h>) => normalizeLucideSvgs(renderToStaticMarkup(el));

describe("normalizeLucideSvgs", () => {
    it("keeps the icon name and drops path data", () => {
        const svg = renderToStaticMarkup(h(Info));
        const redrawn = svg.replace(/<path d="[^"]*"/u, '<path d="M0 0"');
        expect(redrawn).not.toBe(svg);
        expect(normalizeLucideSvgs(redrawn)).toBe(normalizeLucideSvgs(svg));
        expect(normalizeLucideSvgs(svg)).toBe('<svg data-lucide="info"></svg>');
    });

    it("a renamed icon changes the result", () => {
        expect(norm(h(CircleAlert))).not.toBe(norm(h(CircleCheck)));
    });

    it("keeps the name of an icon nested in another icon, and closes the outer svg", () => {
        const a = norm(h(Info, null, h(CircleAlert)));
        const b = norm(h(Info, null, h(CircleCheck)));
        expect(a).not.toBe(b);
        expect(a).toMatch(/^<svg data-lucide="info"><svg data-lucide="[^"]+"><\/svg><\/svg>$/u);
    });

    it("normalises path data whatever the attribute order", () => {
        const svg = renderToStaticMarkup(h(Info, { "data-class": "badge" } as object));
        expect(svg.indexOf('data-class="badge"')).toBeGreaterThan(svg.indexOf(' class="'));
        const redrawn = svg.replace(/<path d="[^"]*"/u, '<path d="M0 0"');
        expect(redrawn).not.toBe(svg);
        expect(normalizeLucideSvgs(redrawn)).toBe(normalizeLucideSvgs(svg));
        expect(normalizeLucideSvgs(svg)).not.toMatch(/<path/u);
        const before = svg.replace(/( class="[^"]*")([^>]*)( data-class="badge")/u, "$3$1$2");
        expect(normalizeLucideSvgs(before)).toBe(normalizeLucideSvgs(svg));
    });

    it("keeps caller classes, including ones that start with 'lucide'", () => {
        const a = norm(h(Info, { className: "lucideButton size-4" }));
        const b = norm(h(Info, { className: "lucideButtonHidden size-4" }));
        expect(a).toBe('<svg data-lucide="info" class="lucideButton size-4"></svg>');
        expect(b).not.toBe(a);
    });

    it("leaves a non-lucide svg untouched", () => {
        const plain = '<svg class="logo" viewBox="0 0 1 1"><path d="M0 0"></path></svg>';
        expect(normalizeLucideSvgs(plain)).toBe(plain);
    });
});
