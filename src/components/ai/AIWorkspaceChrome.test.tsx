import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { AIWorkspaceChrome } from "./AIWorkspaceChrome";
import { AIPageHeader } from "./AIPageHeader";
import { ShellProvider } from "@/components/shell/ShellContext";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/ai",
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

// Keep the sidebar and tab strip lightweight so the test focuses on the
// area-title ordering contract (Framework A2/A6) rather than nav internals.
vi.mock("@/components/navigation/PrimaryNav", () => ({
    PrimaryNav: () => <aside data-testid="primary-nav" />,
}));

vi.mock("./AITabNav", () => ({
    AITabNav: () => <nav data-testid="ai-tab-nav" aria-label="AI views" />,
}));

vi.mock("@/lib/filters/encode", () => ({
    decodeFilter: () => ({}),
    filterFromQueryParams: () => ({}),
    encodeFilterParam: () => "",
}));

describe("AIWorkspaceChrome", () => {
    it("renders the AI area title as the page-level h1", () => {
        render(<AIWorkspaceChrome>content</AIWorkspaceChrome>);
        const areaTitle = screen.getByRole("heading", {
            level: 1,
            name: "AI",
        });
        expect(areaTitle).toBeInTheDocument();
    });

    it("renders the area title ABOVE the tab nav", () => {
        render(<AIWorkspaceChrome>content</AIWorkspaceChrome>);
        const areaTitle = screen.getByRole("heading", {
            level: 1,
            name: "AI",
        });
        const tabNav = screen.getByTestId("ai-tab-nav");
        // DOCUMENT_POSITION_FOLLOWING (4) => tabNav comes after the area title.
        expect(
            areaTitle.compareDocumentPosition(tabNav) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("renders the area title matching the sidebar label (A6 agreement)", () => {
        render(<AIWorkspaceChrome>content</AIWorkspaceChrome>);
        expect(screen.getByRole("heading", { level: 1, name: "AI" })).toBeInTheDocument();
    });

    it("renders a BackLink returning to the cockpit (A5)", () => {
        render(<AIWorkspaceChrome>content</AIWorkspaceChrome>);
        const backLink = screen.getByRole("link", { name: /back to cockpit/i });
        expect(backLink).toBeInTheDocument();
        expect(backLink.getAttribute("href")).toContain("/");
    });

    it("uses tentative AI copy instead of definitive implementation language", () => {
        render(<AIWorkspaceChrome>content</AIWorkspaceChrome>);
        expect(screen.getByText(/AI appears to change/i)).toBeInTheDocument();
        expect(screen.queryByText(/What AI is changing/i)).not.toBeInTheDocument();
    });

    it("demotes the per-tab title to a subordinate h2", () => {
        render(
            <AIWorkspaceChrome>
                <AIPageHeader eyebrow="AI" title="Impact">
                    Per-tab lede copy.
                </AIPageHeader>
            </AIWorkspaceChrome>,
        );
        // Area identity is the single h1.
        expect(screen.getByRole("heading", { level: 1, name: "AI" })).toBeInTheDocument();
        // Per-tab name reads as a sub-section heading.
        const tabTitle = screen.getByRole("heading", { level: 2, name: "Impact" });
        expect(tabTitle).toBeInTheDocument();
        expect(screen.queryByRole("heading", { level: 1, name: "Impact" })).not.toBeInTheDocument();
    });

    it("renders only the page on a route in the shared app shell: no second navigation, main, area header or tab strip", () => {
        render(
            <ShellProvider>
                <AIWorkspaceChrome>
                    <p>page content</p>
                </AIWorkspaceChrome>
            </ShellProvider>,
        );

        expect(screen.getByText("page content")).toBeInTheDocument();
        expect(screen.queryByTestId("primary-nav")).toBeNull();
        expect(screen.queryByRole("main")).toBeNull();
        expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
        expect(screen.queryByTestId("ai-tab-nav")).toBeNull();
        expect(screen.queryByRole("link", { name: /back to cockpit/i })).toBeNull();
    });

    it("keeps the full AI chrome on a route outside the shared app shell", () => {
        render(
            <AIWorkspaceChrome>
                <p>page content</p>
            </AIWorkspaceChrome>,
        );

        expect(screen.getByTestId("primary-nav")).toBeInTheDocument();
        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(screen.getByTestId("ai-tab-nav")).toBeInTheDocument();
        expect(screen.getByRole("main")).toContainElement(screen.getByText("page content"));
    });
});
