/**
 * CHAOS-7788: the `dark:` variant follows the app theme, not the OS color scheme.
 *
 * The app always sets `data-theme` on <html> (root layout, `theme-init.js`, the
 * theme toggle) and every design token follows it. Tailwind's default `dark:`
 * variant is `@media (prefers-color-scheme: dark)`, so a `dark:` class showed
 * the wrong colors whenever the OS setting and the app theme differed (report
 * headings dark on the dark card). This compiles the real `globals.css` with
 * every `dark:` class the source uses and checks where each rule lands.
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { compile } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const SRC_DIR = path.resolve(process.cwd(), "src");
const APP_DIR = path.join(SRC_DIR, "app");
const APP_THEME_DARK = ':where([data-theme="dark"], [data-theme="dark"] *)';

/** Every `dark:` class in the app source (tests excluded). */
function darkClassesInSource(): string[] {
    const found = new Set<string>();
    const files = readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" }).filter(
        (file) => /\.(tsx?|jsx?)$/.test(file) && !/\.test\./.test(file),
    );
    for (const file of files) {
        const source = readFileSync(path.join(SRC_DIR, file), "utf8");
        for (const match of source.matchAll(/(?<![\w-])dark:[a-z][\w/.%-]*/g)) {
            found.add(match[0]);
        }
    }
    return [...found].sort();
}

async function compileGlobals(candidates: string[]): Promise<string> {
    const compiler = await compile(readFileSync(path.join(APP_DIR, "globals.css"), "utf8"), {
        base: APP_DIR,
        loadStylesheet: async (id, base) => {
            const file =
                id === "tailwindcss"
                    ? require.resolve("tailwindcss/index.css")
                    : path.resolve(base, id);
            return { path: file, base: path.dirname(file), content: readFileSync(file, "utf8") };
        },
        loadModule: async (id, base) => ({ path: id, base, module: require(id) }),
    });
    return compiler.build(candidates);
}

type Rule = { selector: string; parents: string[] };

/** Style rules of a compiled sheet, with the preludes of the blocks around each. */
function rules(css: string): Rule[] {
    const out: Rule[] = [];
    const stack: string[] = [];
    let prelude = "";
    for (const char of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
        if (char === "{") {
            const selector = prelude.trim();
            out.push({ selector, parents: [...stack] });
            stack.push(selector);
            prelude = "";
        } else if (char === "}") {
            stack.pop();
            prelude = "";
        } else if (char === ";") {
            prelude = "";
        } else {
            prelude += char;
        }
    }
    return out;
}

const escapeClass = (name: string) => `.${name.replace(/[:/.%[\]()]/g, "\\$&")}`;

describe("the dark variant (CHAOS-7788)", () => {
    const classes = darkClassesInSource();
    let compiled: Rule[] = [];

    beforeAll(async () => {
        compiled = rules(await compileGlobals(classes));
    });

    it("finds the dark classes the app uses", () => {
        // The scan is not empty: the report body and the integrations icon use these.
        expect(classes).toContain("dark:prose-invert");
        expect(classes).toContain("dark:text-gray-100");
    });

    it("applies every dark class under the app's dark theme, not the OS color scheme", () => {
        for (const name of classes) {
            const own = compiled.filter((rule) => rule.selector.startsWith(escapeClass(name)));
            expect(own, `${name} generates a rule`).not.toHaveLength(0);
            for (const rule of own) {
                expect(rule.selector, name).toContain(APP_THEME_DARK);
                expect(
                    rule.parents.filter((parent) => parent.includes("prefers-color-scheme")),
                    `${name} is not inside a prefers-color-scheme block`,
                ).toEqual([]);
            }
        }
    });
});
