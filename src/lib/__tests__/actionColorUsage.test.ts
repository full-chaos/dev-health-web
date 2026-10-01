import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// CHAOS ticket 1.7: links and actions use the action color (`--accent-2`, `--info` on tinted
// pills), never orange. Orange text is `--accent-text` (selection, eyebrows, badges). This scan
// covers the whole app source except the marketing pages.
const SRC = new URL("../..", import.meta.url).pathname;

const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            return name === "__tests__" || name === "marketing" || name === "(marketing)"
                ? []
                : walk(path);
        }
        return /\.(tsx|ts)$/u.test(name) && !/\.test\./u.test(name) ? [path] : [];
    });

const ORANGE_TEXT =
    /(?<![\w-])(?:(?:hover|group-hover|focus|focus-visible):)?text-\(--accent\)(?![\w-])|(?<![\w-])text-accent(?![\w-])/gu;

// Orange text that is not a link or action: form-control glyphs (the checkmark color), the
// empty-state icon and the integrations logo (graphics).
const isAllowed = (line: string, path: string) =>
    /rounded[^"]*border[^"]*text-\(--accent\)[^"]*focus:ring|h-4 w-4[^"]*text-\(--accent\)/u.test(
        line,
    ) ||
    path.split(":")[0].endsWith("components/ui/EmptyState.tsx") ||
    path.split(":")[0].endsWith("integrations/page.tsx");

describe("action color usage", () => {
    const files = walk(SRC);

    it("no link or action text is orange", () => {
        const offenders = files.flatMap((path) =>
            readFileSync(path, "utf8")
                .split("\n")
                .map((line, index) => ({ line, at: `${path.replace(SRC, "")}:${index + 1}` }))
                .filter(({ line }) => new RegExp(ORANGE_TEXT.source, "u").test(line))
                .filter(({ line, at }) => !isAllowed(line, at))
                .map(({ at }) => at),
        );
        expect(offenders).toEqual([]);
    });

    it("separators use the muted text token without the 60 percent fade", () => {
        const offenders = files
            .filter((path) =>
                /text-\((?:--ink-muted|--text-muted)\)\/60/u.test(readFileSync(path, "utf8")),
            )
            .map((path) => path.replace(SRC, ""));
        expect(offenders).toEqual([]);
    });
});
