import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Pins the type scale to the approved prototype (theme.css / style.css). The vendored Inter has
// static 400/500/600/700 files only, so 620/630/640 are pinned at 600 and 650 at 700.
const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const start = css.indexOf("--text-display:");
const theme = css.slice(css.lastIndexOf("@theme", start), css.indexOf("\n}\n", start));

const token = (name: string): string | undefined =>
    new RegExp(`${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`).exec(theme)?.[1].trim();

const SCALE: Array<[string, string, string, string?, string?]> = [
    // name, size, weight, letter-spacing, line-height
    ["h1", "24px", "700", "-0.4px", "32px"],
    ["h2", "18px", "600", "-0.2px", "26px"],
    ["h3", "15px", "600", undefined, "22px"],
    ["card-title", "14px", "600", undefined, "22px"],
    ["value", "24px", "600", "-0.6px", "22px"],
    ["metric", "28px", "700", "-0.8px", "1.1"],
    ["value-hero", "37px", "600", "-1px", "44.4px"],
    ["label-caps", "11px", "", "0.9px", "16px"],
    ["pill", "10px", "700", "0.5px", "16px"],
];

describe("type scale tokens (approved prototype)", () => {
    it.each(SCALE)(
        "text-%s: size %s, weight %s, tracking %s, line %s",
        (name, size, weight, ls, lh) => {
            expect(token(`--text-${name}`)).toBe(size);
            if (weight) expect(token(`--text-${name}--font-weight`)).toBe(weight);
            else expect(token(`--text-${name}--font-weight`)).toBeUndefined();
            if (ls) expect(token(`--text-${name}--letter-spacing`)).toBe(ls);
            else expect(token(`--text-${name}--letter-spacing`)).toBeUndefined();
            expect(token(`--text-${name}--line-height`)).toBe(lh);
        },
    );

    it("does not define the tokens twice (a later block would silently win)", () => {
        expect(css.match(/--text-h1:/g)).toHaveLength(1);
    });
});
