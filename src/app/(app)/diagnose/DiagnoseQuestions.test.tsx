import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { DiagnoseQuestions } from "./DiagnoseQuestions";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";

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

afterEach(cleanup);

const filters = defaultMetricFilter;
const draw = (role?: string) => render(<DiagnoseQuestions filters={filters} role={role} />);

describe("DiagnoseQuestions (approved prototype diagnoseHub, CHAOS-8065)", () => {
    it("is one section card: the heading, then the triage line under it, then the buttons", () => {
        draw();
        const section = screen.getByTestId("diagnose-questions");
        expect(section.tagName).toBe("SECTION");
        const heading = within(section).getByRole("heading", {
            level: 2,
            name: "Follow a question into evidence",
        });
        const note = within(section).getByText(
            "The overview is a triage surface. Each destination retains its own tabs and investigation views.",
        );
        const row = within(section).getByTestId("diagnose-question-row");
        // Section head order: title, description, then the body (the description is not a footnote).
        expect(heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
        expect(note.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
    });

    it("has the three prototype buttons in one row, in the prototype order, each with an icon", () => {
        draw();
        const row = screen.getByTestId("diagnose-question-row");
        const links = within(row).getAllByRole("link");
        expect(links.map((a) => a.textContent)).toEqual([
            "Explore the work graph",
            "Inspect review latency",
            "Trace effort allocation",
        ]);
        expect(row.className).toContain("md:grid-cols-3");
        for (const link of links) {
            // A direct child of the grid, so it fills its column like the prototype's buttons.
            expect(link.parentElement).toBe(row);
            expect(link.querySelector("svg[aria-hidden='true']")).not.toBeNull();
        }
    });

    it("links the work graph with the filters and role", () => {
        draw("manager");
        expect(screen.getByRole("link", { name: "Explore the work graph" })).toHaveAttribute(
            "href",
            withFilterParam("/diagnose/work-graph", filters, "manager"),
        );
    });

    it("links the review latency evidence page with the filters and role", () => {
        draw("manager");
        expect(screen.getByRole("link", { name: "Inspect review latency" })).toHaveAttribute(
            "href",
            buildExploreUrl({ metric: "review_latency", filters, role: "manager" }),
        );
    });

    it("links the investment allocation tab with the filters and role", () => {
        draw("manager");
        expect(screen.getByRole("link", { name: "Trace effort allocation" })).toHaveAttribute(
            "href",
            withFilterParam("/investment?tab=allocation", filters, "manager"),
        );
    });
});
