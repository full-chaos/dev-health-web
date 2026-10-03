import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

import { InvestigateTestOps } from "./InvestigateTestOps";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: React.ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

const ninetyDays: MetricFilter = {
    ...defaultMetricFilter,
    time: { range_days: 90, compare_days: 90 },
};

afterEach(cleanup);

describe("InvestigateTestOps", () => {
    it("is a section card with one row per TestOps detail tab, in tab order", () => {
        render(<InvestigateTestOps filters={defaultMetricFilter} />);
        const card = screen.getByTestId("testops-investigate");
        expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(
            "Investigate TestOps",
        );
        const rows = within(card).getAllByTestId("testops-investigate-row");
        expect(
            rows.map((row) => within(row).getByText(/Pipelines|Tests|Coverage/).textContent),
        ).toEqual(["Pipelines", "Tests", "Coverage"]);
        // The Overview tab (the page itself) is not a row.
        expect(within(card).queryByText("Overview")).toBeNull();
    });

    it("gives each row an 'Open' link to its tab route that keeps the scope, window and role", () => {
        render(<InvestigateTestOps filters={ninetyDays} role="em" />);
        const expected = `f=${encodeURIComponent(encodeFilterParam(ninetyDays))}`;
        for (const [name, path] of [
            ["Open Pipelines", "/testops/pipelines"],
            ["Open Tests", "/testops/tests"],
            ["Open Coverage", "/testops/coverage"],
        ]) {
            const link = screen.getByRole("link", { name });
            expect(link).toHaveTextContent("Open");
            const href = link.getAttribute("href") ?? "";
            expect(href.split("?")[0]).toBe(path);
            expect(new URLSearchParams(href.split("?")[1]).get("f")).toBe(
                encodeFilterParam(ninetyDays),
            );
            expect(href).toContain(expected);
            expect(new URLSearchParams(href.split("?")[1]).get("role")).toBe("em");
        }
    });
});
