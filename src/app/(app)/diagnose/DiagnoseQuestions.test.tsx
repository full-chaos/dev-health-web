import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@/test/utils";

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

describe("DiagnoseQuestions (CHAOS-7612, new from the approved concept)", () => {
    it("has the concept heading and the triage note", () => {
        draw();
        expect(
            screen.getByRole("heading", { level: 2, name: "Follow a question into evidence" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/The overview is a triage surface\. Each destination retains/),
        ).toBeInTheDocument();
    });

    it("links the work graph with the filters and role", () => {
        draw("manager");
        expect(screen.getByRole("link", { name: /Work graph/ })).toHaveAttribute(
            "href",
            withFilterParam("/diagnose/work-graph", filters, "manager"),
        );
    });

    it("links the review latency evidence page with the filters and role", () => {
        draw("manager");
        expect(screen.getByRole("link", { name: /Review latency/ })).toHaveAttribute(
            "href",
            buildExploreUrl({ metric: "review_latency", filters, role: "manager" }),
        );
    });

    it("links the investment allocation tab with the filters and role", () => {
        draw("manager");
        expect(screen.getByRole("link", { name: /Effort allocation/ })).toHaveAttribute(
            "href",
            withFilterParam("/investment?tab=allocation", filters, "manager"),
        );
    });

    it("uses registry labels, and each accessible name tells the three apart", () => {
        draw();
        const names = screen.getAllByRole("link").map((a) => a.getAttribute("aria-labelledby"));
        expect(names).toHaveLength(3);
        const accessible = screen.getAllByRole("link").map((a) => a.textContent);
        expect(accessible).toEqual(["Open Work Graph", "Open evidence", "Open Investment"]);
        expect(
            screen.getByRole("link", { name: "Review latency Open evidence" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Work graph Open Work Graph" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Effort allocation Open Investment" }),
        ).toBeInTheDocument();
    });
});
