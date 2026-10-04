import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { PageHeader } from "./PageHeader";

const navigationMock = vi.hoisted(() => ({ pathname: "/investment" }));

vi.mock("next/navigation", () => ({
    usePathname: () => navigationMock.pathname,
}));

beforeEach(() => {
    navigationMock.pathname = "/investment";
});

describe("PageHeader — eyebrow from the navigation trail", () => {
    it("ends the eyebrow on the trail leaf of a metric evidence page", () => {
        navigationMock.pathname = "/explore";
        render(<PageHeader title="Blocked Work" trailLeaf="Blocked Work evidence" />);

        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Diagnose / Blocked Work evidence",
        );
    });

    it("shows AREA / DESTINATION for a child destination", () => {
        render(<PageHeader />);

        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent(
            "Diagnose / Investment",
        );
    });

    it("shows the area for a page with its own title", () => {
        navigationMock.pathname = "/dashboard";
        render(<PageHeader title="Weekly summary" />);

        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("Home");
    });

    it("leaves the eyebrow out when it would only repeat the title (A8)", () => {
        navigationMock.pathname = "/dashboard";
        render(<PageHeader />);

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Home");
        expect(screen.queryByTestId("page-header-eyebrow")).toBeNull();
    });

    it("has no eyebrow on a route that no area owns", () => {
        navigationMock.pathname = "/demo";
        render(<PageHeader title="Pull request 1" />);

        expect(screen.queryByTestId("page-header-eyebrow")).toBeNull();
    });
});

describe("PageHeader — title, subtitle and actions", () => {
    it("renders exactly one h1, with the nav config's title by default (A6)", () => {
        render(<PageHeader subtitle="Where effort goes." />);

        const headings = screen.getAllByRole("heading");
        expect(headings).toHaveLength(1);
        expect(headings[0].tagName).toBe("H1");
        expect(headings[0]).toHaveTextContent("Investment");
        expect(screen.getByText("Where effort goes.")).toBeInTheDocument();
    });

    it("uses the passed title for the h1", () => {
        render(<PageHeader title="Ana Lima" />);

        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ana Lima");
    });

    it("is one header element", () => {
        render(<PageHeader />);

        expect(screen.getByTestId("page-header").tagName).toBe("HEADER");
    });

    it("renders the actions in the actions slot", () => {
        render(<PageHeader actions={<button type="button">Export report</button>} />);

        const slot = screen.getByTestId("page-header-actions");
        expect(within(slot).getByRole("button", { name: "Export report" })).toBeInTheDocument();
    });

    it("renders no actions slot and no subtitle when none is passed", () => {
        render(<PageHeader />);

        expect(screen.queryByTestId("page-header-actions")).toBeNull();
        expect(screen.getByTestId("page-header").querySelectorAll("p")).toHaveLength(1);
    });

    it("renders the meta row under the title block", () => {
        render(
            <PageHeader>
                <p>Last updated: now</p>
            </PageHeader>,
        );

        expect(
            within(screen.getByTestId("page-header")).getByText("Last updated: now"),
        ).toBeInTheDocument();
    });
});

describe("PageHeader — BackLink versus breadcrumbs (A5)", () => {
    it("does not render a BackLink whose target is the last breadcrumb link", () => {
        render(<PageHeader back={{ href: "/diagnose?f=abc&role=em", area: "Diagnose" }} />);

        expect(screen.queryByRole("link", { name: "Back to Diagnose" })).toBeNull();
        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });

    it("renders the BackLink of a detail page, with its state params", () => {
        navigationMock.pathname = "/people/person-1";
        render(
            <PageHeader
                title="Ana Lima"
                back={{ href: "/people?f=abc&role=em&lens=pm", area: "People" }}
            />,
        );

        expect(screen.getByRole("link", { name: "Back to People" })).toHaveAttribute(
            "href",
            "/people?f=abc&role=em&lens=pm",
        );
    });

    it("renders no BackLink when none is passed", () => {
        render(<PageHeader />);

        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });
});

describe("PageHeader — title adornment", () => {
    it("draws the adornment in the title row beside the h1, not inside it", () => {
        render(<PageHeader title="Organization" titleAdornment={<span>Platform admin</span>} />);

        const heading = screen.getByRole("heading", { level: 1 });
        expect(heading).toHaveTextContent("Organization");
        expect(heading).not.toHaveTextContent("Platform admin");
        const adornment = screen.getByTestId("page-header-title-adornment");
        expect(adornment).toHaveTextContent("Platform admin");
        expect(adornment.parentElement).toBe(heading.parentElement);
        expect(
            heading.compareDocumentPosition(adornment) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("draws nothing when there is no adornment", () => {
        render(<PageHeader title="Organization" />);

        expect(screen.queryByTestId("page-header-title-adornment")).toBeNull();
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    });
});
