import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { SHELL_ROUTES } from "@/components/shell/shellRoutes";

// A page under a registered shell prefix gets its chrome from the shared app
// shell. It must not bring its own navigation, `<main>`, context bars or trail,
// and it uses the shared page header. This scan is driven by the shell route
// registry, so a prefix cannot be registered before its pages are migrated.

const appRoot = join(process.cwd(), "src/app/(app)");

function listFiles(directory: string, recursive: boolean): string[] {
    if (!existsSync(directory)) return [];
    return readdirSync(directory).flatMap((entry) => {
        const fullPath = join(directory, entry);
        if (!statSync(fullPath).isDirectory()) return [fullPath];
        return recursive ? listFiles(fullPath, true) : [];
    });
}

/** Comments can name the old chrome (they explain its removal): scan code only. */
const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// An exact route covers the files in its own directory only.
const filesUnderShellPrefixes = [
    ...new Set(
        SHELL_ROUTES.flatMap((route) => listFiles(join(appRoot, route.prefix), !route.exact)),
    ),
];
const sources = filesUnderShellPrefixes.map((filePath) => ({
    file: relative(process.cwd(), filePath),
    name: filePath.slice(filePath.lastIndexOf("/") + 1),
    source: stripComments(readFileSync(filePath, "utf8")),
}));

/** A page that only redirects renders nothing, so it has no chrome to check. */
const isRedirectOnly = (source: string) =>
    source.includes("redirect(") && !source.includes("return (");

const pages = sources.filter((entry) => entry.name === "page.tsx" && !isRedirectOnly(entry.source));
const routeStates = sources.filter(
    (entry) => entry.name === "loading.tsx" || entry.name === "error.tsx",
);

const FORBIDDEN_IN_PAGE: Array<[string, RegExp]> = [
    ["its own PrimaryNav", /<PrimaryNav[\s/>]/],
    ["its own <main>", /<main[\s>]/],
    ["the global context bar", /<GlobalContextBar(?:Client)?[\s/>]/],
    ["the page filter bar", /<FilterBar(?:Client)?[\s/>]/],
    ["the context strip", /<ContextStrip[\s/>]/],
    ["an in-page breadcrumb trail", /<Breadcrumbs[\s/>]/],
];

describe("shell pages bring no chrome of their own", () => {
    it("finds the pages of every registered prefix", () => {
        expect(SHELL_ROUTES.length).toBeGreaterThan(0);
        for (const route of SHELL_ROUTES) {
            const found = pages.filter((entry) =>
                entry.file.startsWith(`src/app/(app)${route.prefix}/`),
            );
            const redirects = sources.filter(
                (entry) =>
                    entry.name === "page.tsx" &&
                    entry.file.startsWith(`src/app/(app)${route.prefix}/`) &&
                    isRedirectOnly(entry.source),
            );
            expect(found.length + redirects.length, route.prefix).toBeGreaterThan(0);
        }
    });

    it.each(FORBIDDEN_IN_PAGE)("no shell page renders %s", (_label, pattern) => {
        const offenders = pages.filter((entry) => pattern.test(entry.source)).map((e) => e.file);
        expect(offenders).toEqual([]);
    });

    it("every shell page uses the shared PageHeader", () => {
        const offenders = pages
            .filter((entry) => !/<PageHeader[\s/>]/.test(entry.source))
            .map((entry) => entry.file);
        expect(offenders).toEqual([]);
    });

    it("a shell page that shows ServiceUnavailable does not let it bring a second <main>", () => {
        const offenders = pages
            .filter((entry) => {
                const uses = entry.source.match(/<ServiceUnavailable\b[^>]*>/g) ?? [];
                return uses.some((use) => !use.includes("landmark={false}"));
            })
            .map((entry) => entry.file);
        expect(offenders).toEqual([]);
    });

    it("loading and error states of a shell route have no <main> and no navigation skeleton", () => {
        const offenders = routeStates
            .filter((entry) => /<main[\s>]/.test(entry.source) || /NavSkeleton/.test(entry.source))
            .map((entry) => entry.file);
        expect(offenders).toEqual([]);
    });
});
