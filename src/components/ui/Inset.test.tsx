import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { Inset } from "./Inset";

describe("Inset", () => {
    it("titled: h4 title and a muted body, prototype box classes", () => {
        render(
            <Inset title="P50" data-testid="i" className="mt-0">
                body
            </Inset>,
        );
        const box = screen.getByTestId("i");
        expect(box.className.split(/\s+/u)).toEqual(
            expect.arrayContaining(["rounded-sm", "bg-background", "p-3.75", "mt-0"]),
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
