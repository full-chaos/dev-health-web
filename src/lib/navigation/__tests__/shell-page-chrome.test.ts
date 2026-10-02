import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

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

const PAGE_HEADER = /<PageHeader[\s/>]/;

/**
 * A page renders the shared page header itself, or it gives its header to one
 * component that renders it (the Security repository page: its title is the
 * repository name, which a client hook reads). The component must be rendered
 * by the page, and its own source must render `PageHeader`.
 */
function readComponentSource(file: string): string | undefined {
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

function rendersSharedPageHeader(
    entry: { file: string; source: string },
    readSource: (file: string) => string | undefined = readComponentSource,
): boolean {
    if (PAGE_HEADER.test(entry.source)) return true;

    const imports = entry.source.matchAll(/import\s+\{([^}]+)\}\s+from\s+"(@\/[^"]+|\.[^"]+)";/g);
    for (const [, names, specifier] of imports) {
        const rendered = names
            .split(",")
            .map(
                (name) =>
                    name
                        .trim()
                        .split(/\s+as\s+/)
                        .pop() ?? "",
            )
            .some((name) => name !== "" && new RegExp(`<${name}[\\s/>]`).test(entry.source));
        if (!rendered) continue;

        const base = specifier.startsWith("@/")
            ? join(process.cwd(), "src", specifier.slice(2))
            : join(process.cwd(), dirname(entry.file), specifier);
        for (const candidate of [`${base}.tsx`, join(base, "index.tsx")]) {
            const componentSource = readSource(candidate);
            if (componentSource !== undefined && PAGE_HEADER.test(stripComments(componentSource))) {
                return true;
            }
        }
    }
    return false;
}

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

    it("every shell page uses the shared PageHeader, itself or through one header component", () => {
        const offenders = pages
            .filter((entry) => !rendersSharedPageHeader(entry))
            .map((entry) => entry.file);
        expect(offenders).toEqual([]);
    });

    it("accepts a header component only when that component renders PageHeader", () => {
        // Component sources are given here, so the test does not depend on the
        // components of other pages.
        const sources: Record<string, string> = {
            [join(process.cwd(), "src/components/demo/DemoHeader.tsx")]:
                'export function DemoHeader() { return <PageHeader title="Demo" />; }',
            [join(process.cwd(), "src/components/demo/DemoList.tsx")]:
                "export function DemoList() { return <ul />; }",
        };
        const read = (file: string) => sources[file];
        const page = (source: string) => ({ file: "src/app/(app)/demo/x/page.tsx", source });

        // Renders a component that renders PageHeader.
        expect(
            rendersSharedPageHeader(
                page(
                    'import { DemoHeader } from "@/components/demo/DemoHeader";\nexport default function P() { return <DemoHeader />; }',
                ),
                read,
            ),
        ).toBe(true);
        // Imports it, but does not render it.
        expect(
            rendersSharedPageHeader(
                page(
                    'import { DemoHeader } from "@/components/demo/DemoHeader";\nexport default function P() { return <div />; }',
                ),
                read,
            ),
        ).toBe(false);
        // Renders a component that has no PageHeader.
        expect(
            rendersSharedPageHeader(
                page(
                    'import { DemoList } from "@/components/demo/DemoList";\nexport default function P() { return <DemoList />; }',
                ),
                read,
            ),
        ).toBe(false);
        // Renders PageHeader itself.
        expect(
            rendersSharedPageHeader(page('export default () => <PageHeader title="X" />;'), read),
        ).toBe(true);
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

describe("Cognitive Load keeps its privacy framing in the shell", () => {
    const pagePath = join(appRoot, "cognitive-load/page.tsx");
    // The privacy header lives in `PrivacyHeader` (CognitiveLoadViews); the page renders it.
    const pageSource = readFileSync(pagePath, "utf8").replace(/\s+/g, " ");
    const viewsSource = readFileSync(
        join(appRoot, "../../components/cognitive-load/CognitiveLoadViews.tsx"),
        "utf8",
    ).replace(/\s+/g, " ");
    const source = viewsSource;

    it.each([
        "Privacy-first cognitive load",
        "Focus fragmentation, not surveillance.",
        "This surface uses existing PR, review, work-item, and commit-time rollups to show where attention is being split. It does not collect IDE, keystroke, prompt, or session telemetry.",
        "No leaderboards. No peer rankings. Team and repo aggregation comes first.",
        "Single-person views are limited to explicit self-reflection or coaching context.",
    ])("keeps the sentence: %s", (sentence) => {
        expect(source).toContain(sentence);
    });

    it("has the page title as the one h1 and the privacy statement as a second-level heading", () => {
        expect(pageSource).toContain('<PageHeader title="Cognitive Load" />');
        expect(pageSource).toContain("<PrivacyHeader />");
        expect(pageSource).not.toMatch(/<h1[\s>]/);
        expect(source).not.toMatch(/<h1[\s>]/);
        expect(source).toMatch(/<h2 [^>]*> Focus fragmentation, not surveillance\. <\/h2>/);
    });
});
