import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { Inset } from "./Inset";

describe("Inset", () => {
    it("titled: h4 title and a muted body, prototype box classes", () => {
        render(
            <Inset title="P50" data-testid="i">
                body
            </Inset>,
        );
        const box = screen.getByTestId("i");
        expect(box.className.split(/\s+/u)).toEqual(
            expect.arrayContaining(["rounded-sm", "bg-background", "p-3.75", "mt-3.5"]),
        );
        expect(screen.getByRole("heading", { level: 4, name: "P50" })).toBeInTheDocument();
        expect(screen.getByText("body")).toHaveClass("text-(--ink-muted)");
    });

    it("untitled: bare box, children as given, caller classes kept, default mt-3.5", () => {
        render(
            <Inset data-testid="i" className="text-xs">
                <p>own content</p>
            </Inset>,
        );
        const box = screen.getByTestId("i");
        expect(box.className.split(/\s+/u)).toEqual(
            expect.arrayContaining(["mt-3.5", "rounded-sm", "bg-background", "p-3.75", "text-xs"]),
        );
        expect(box.querySelector("h4")).toBeNull();
        expect(box.firstElementChild?.tagName).toBe("P");
    });
});

describe("Inset margin and element (CHAOS-8483)", () => {
    it("default has the prototype's 14px top margin; flush has no margin class", () => {
        render(
            <>
                <Inset data-testid="d">a</Inset>
                <Inset flush data-testid="f">
                    b
                </Inset>
            </>,
        );
        expect(screen.getByTestId("d").className.split(/\s+/u)).toContain("mt-3.5");
        expect(screen.getByTestId("f").className).not.toMatch(/\bmt-/u);
        expect(screen.getByTestId("f").className.split(/\s+/u)).toEqual(
            expect.arrayContaining(["rounded-sm", "bg-background", "p-3.75"]),
        );
    });

    it("renders the element the caller names", () => {
        render(
            <ul>
                <Inset as="li" flush data-testid="li">
                    row
                </Inset>
            </ul>,
        );
        expect(screen.getByTestId("li").tagName).toBe("LI");
        render(
            <Inset as="section" flush data-testid="sec">
                s
            </Inset>,
        );
        expect(screen.getByTestId("sec").tagName).toBe("SECTION");
    });

    it("no caller passes its own margin class to an Inset", () => {
        const SRC = join(process.cwd(), "src");
        const bad: string[] = [];
        const walk = (dir: string) => {
            for (const e of readdirSync(dir, { withFileTypes: true })) {
                const full = join(dir, e.name);
                if (e.isDirectory()) walk(full);
                else if (/\.tsx$/u.test(e.name) && !/\.(test|stories)\./u.test(e.name)) {
                    const text = readFileSync(full, "utf8");
                    for (const m of text.matchAll(/<Inset\b[^>]*>/gu))
                        if (/className="[^"]*\bm[tby]?-/u.test(m[0])) bad.push(relative(SRC, full));
                }
            }
        };
        walk(SRC);
        expect(bad).toEqual([]);
    });
});

describe("one shared inset", () => {
    const SRC = join(process.cwd(), "src");
    const walk = (dir: string, out: string[] = []): string[] => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, e.name);
            if (e.isDirectory()) walk(full, out);
            else if (/\.tsx$/u.test(e.name) && !/\.(test|stories)\./u.test(e.name)) out.push(full);
        }
        return out;
    };

    it("no local copy of the inset box (rounded-sm + bg-background + p-3.75) outside ui/Inset", () => {
        const copies = walk(SRC)
            .filter((f) => relative(SRC, f) !== join("components", "ui", "Inset.tsx"))
            .filter((f) =>
                readFileSync(f, "utf8")
                    .split("\n")
                    .some(
                        (l) =>
                            /\brounded-sm\b/u.test(l) &&
                            /\bbg-background\b/u.test(l) &&
                            /\bp-3\.75\b/u.test(l),
                    ),
            )
            .map((f) => relative(SRC, f));
        expect(copies).toEqual([]);
    });

    it("the local capacity/Inset is gone", () => {
        const left = walk(SRC).filter(
            (f) => relative(SRC, f) === join("components", "capacity", "Inset.tsx"),
        );
        expect(left).toEqual([]);
    });
});
