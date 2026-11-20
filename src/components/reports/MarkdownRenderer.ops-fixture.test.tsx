import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { MarkdownRenderer } from "./MarkdownRenderer";
import { AUTOLINK_CONSTRUCTS, removeAutolinkConstructs } from "./remarkReportText";

// CHAOS-14322: the stored report Markdown is written by the ops renderer (fixtures made by the real
// renderMarkdown, see __tests__/fixtures/gen-report-markdown.go.txt) and read by the real MarkdownRenderer
// (react-markdown + remark-gfm). goldmark, the ops proof parser, is not this parser: remark-gfm builds
// autolinks from decoded text, so a backslash in the stored text does not stop them.
const FIXTURE_DIR = path.join(__dirname, "__tests__", "fixtures");

type Case = { id: string; value: string; autolink: boolean; md: string; raw: string };
const fixture = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, "report-markdown.json"), "utf8"),
) as {
    opsSha: string;
    generatorSha256: string;
    cases: Case[];
};

const texts = (container: HTMLElement, selector: string) =>
    Array.from(container.querySelectorAll(selector)).map((el) => el.textContent);

async function checkReport(content: string, value: string) {
    const { container } = render(<MarkdownRenderer content={content} />);
    await screen.findByRole("heading", { level: 3, name: /^Weekly Health Report/ });
    await userEvent.click(screen.getByRole("button", { name: /provenance/i }));

    expect(container.querySelectorAll("a, [href], img")).toHaveLength(0);
    expect(texts(container, "h4")).toContain(value);
    expect(texts(container, "h6")).toContain(value);
    const cells = texts(container, "td").filter((text) => text === value);
    expect(cells).toHaveLength(2);
    const notes = texts(container, "em");
    expect(notes).toContain(`Note: ${value}`);
    expect(notes).toContain(`Not applicable: ${value}`);
    expect(texts(container, "li")).toContain(`${value}: ${value}`);
    expect(texts(container, "strong")).toContain(`chart:${value}`);
    expect(screen.getByText(/^Generated at /).textContent).toBe(
        `Generated at 2026-01-08T00:00:00+00:00 | Confidence: high | Scope: teams=${value}`,
    );
}

describe("report Markdown from the ops renderer, read by the real MarkdownRenderer (CHAOS-14322)", () => {
    it("names its source: ops sha and the generator it was made by", () => {
        expect(fixture.opsSha).toMatch(/^[0-9a-f]{40}$/);
        const generator = readFileSync(path.join(FIXTURE_DIR, "gen-report-markdown.go.txt"));
        expect(createHash("sha256").update(generator).digest("hex")).toBe(fixture.generatorSha256);
        const baseline = ["https", "http-upper", "ftp", "www", "www-upper", "email", "mixed"];
        expect(fixture.cases.map((c) => c.id)).toEqual(expect.arrayContaining(baseline));
    });

    it.each(fixture.cases.map((c) => [c.id, c] as const))(
        "%s: no link nodes, and every field shows the value as written",
        async (_id, c) => {
            await checkReport(c.md, c.value);
        },
    );

    // Not from the ops renderer (it escapes "[" and "<"): a link someone wrote into stored text stays text too.
    it("an authored link or a bracketed autolink is drawn as its text", async () => {
        const content =
            "# Weekly Health Report\n\nSee [the docs](https://x.co/d) and <https://y.co> and [ref][r].\n\n[r]: https://z.co\n";
        const { container } = render(<MarkdownRenderer content={content} />);
        await screen.findByRole("heading", { level: 3, name: /^Weekly Health Report/ });
        expect(container.querySelectorAll("a, [href]")).toHaveLength(0);
        expect(container.querySelector("p")?.textContent).toBe(
            "See the docs and https://y.co and ref.",
        );
    });

    // Mutants: the cell must be red for a fixture with the raw value, and for a reader without the fix.
    it.each(
        fixture.cases.filter((c) => !c.autolink && c.raw !== c.md).map((c) => [c.id, c] as const),
    )("mutant %s: the unescaped value is red (inline Markdown renders)", async (_id, c) => {
        await expect(checkReport(c.raw, c.value)).rejects.toThrow();
    });

    // ftp:// is the one scheme micromark does not link (goldmark does): it has no reader-side witness.
    it.each(
        fixture.cases.filter((c) => c.autolink && c.id !== "ftp").map((c) => [c.id, c] as const),
    )("mutant %s: a plain remark-gfm reader of the same stored text builds links", (_id, c) => {
        const { container } = render(
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.md}</ReactMarkdown>,
        );
        expect(container.querySelectorAll("a").length).toBeGreaterThan(0);
    });
});

describe("remarkReportText guard", () => {
    // A rename of a construct on a remark-gfm upgrade would turn the literal autolinks back on without a sound:
    // every name must be found in what remark-gfm registers, and be gone after the removal.
    it("finds and removes each literal-autolink construct that remark-gfm registers", () => {
        const store: { micromarkExtensions?: unknown[] } = {};
        (remarkGfm as unknown as (this: { data: () => unknown }) => void).call({
            data: () => store,
        });
        const extensions = store.micromarkExtensions as Parameters<
            typeof removeAutolinkConstructs
        >[0];
        expect(extensions.length).toBeGreaterThan(0);
        const removed = removeAutolinkConstructs(extensions);
        expect([...new Set(removed)].sort()).toEqual([...AUTOLINK_CONSTRUCTS].sort());
        const left = extensions.flatMap((e) =>
            Object.values((e as { text?: Record<string, unknown> }).text ?? {}).flat(),
        ) as { name?: string }[];
        expect(left.filter((c) => AUTOLINK_CONSTRUCTS.has(c.name ?? ""))).toEqual([]);
    });
});
