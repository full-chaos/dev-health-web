import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { AITabNav } from "./AITabNav";
import type { MetricFilter } from "@/lib/filters/types";

const pathnameMock = vi.fn(() => "/ai");

vi.mock("next/navigation", () => ({
    usePathname: () => pathnameMock(),
}));

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

vi.mock("@/lib/filters/url", () => ({
    withFilterParam: (href: string) => href,
}));

const filters: MetricFilter = {
    scope: { level: "org", ids: [] },
    time: {
        range_days: 30,
        compare_days: 0,
        start_date: undefined,
        end_date: undefined,
    },
    who: {},
    what: {},
    why: {},
    how: {},
};

describe("AITabNav", () => {
    it("renders only real AI tab labels", () => {
        pathnameMock.mockReturnValue("/ai");
        render(<AITabNav filters={filters} />);
        for (const label of [
            "Overview",
            "Impact",
            "Review Load",
            "Governance Risk",
            "Automations",
        ]) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
        for (const hiddenLabel of ["Attribution", "Test Gaps", "Evidence"]) {
            expect(screen.queryByText(hiddenLabel)).not.toBeInTheDocument();
        }
    });

    it("defaults the Overview tab as active on /ai", () => {
        pathnameMock.mockReturnValue("/ai");
        render(<AITabNav filters={filters} />);
        expect(screen.getByText("Overview").closest("a")).toHaveAttribute("aria-current", "page");
    });

    it("marks /ai/impact as the Impact tab", () => {
        pathnameMock.mockReturnValue("/ai/impact");
        render(<AITabNav filters={filters} />);
        expect(screen.getByText("Impact").closest("a")).toHaveAttribute("aria-current", "page");
    });

    it("marks the Governance Risk tab active on /ai/risk", () => {
        pathnameMock.mockReturnValue("/ai/risk");
        render(<AITabNav filters={filters} />);
        const riskLink = screen.getByText("Governance Risk").closest("a");
        expect(riskLink).toHaveAttribute("aria-current", "page");
        expect(screen.getByText("Impact").closest("a")).not.toHaveAttribute("aria-current");
    });

    it("claims no active tab on preview routes outside the strip (CHAOS-2200)", () => {
        pathnameMock.mockReturnValue("/ai/attribution");
        render(<AITabNav filters={filters} />);
        for (const label of [
            "Overview",
            "Impact",
            "Review Load",
            "Governance Risk",
            "Automations",
        ]) {
            expect(screen.getByText(label).closest("a")).not.toHaveAttribute("aria-current");
        }
    });

    it("does not render preview badges for hidden placeholder routes", () => {
        pathnameMock.mockReturnValue("/ai");
        render(<AITabNav filters={filters} />);
        expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    });

    it("points each tab at its route", () => {
        pathnameMock.mockReturnValue("/ai");
        render(<AITabNav filters={filters} />);
        expect(screen.getByText("Overview").closest("a")).toHaveAttribute("href", "/ai");
        expect(screen.getByText("Impact").closest("a")).toHaveAttribute("href", "/ai/impact");
        expect(screen.getByText("Review Load").closest("a")).toHaveAttribute(
            "href",
            "/ai/review-load",
        );
        expect(screen.getByText("Automations").closest("a")).toHaveAttribute(
            "href",
            "/ai/automations",
        );
    });
});
