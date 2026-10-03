import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { SelectedPathPanel } from "./SelectedPathPanel";

const numbers = { allocated: 12.34, share: 25, baselineShare: 20, changePp: 5 };
const base = {
    unit: "work units",
    shareBase: "all allocation",
    hasBaseline: true,
    evidenceHref: "/investment?tab=evidence&f=abc",
};

describe("SelectedPathPanel", () => {
    it("shows the empty-state text when nothing is selected", () => {
        render(<SelectedPathPanel selection={null} numbers={null} {...base} />);
        expect(screen.getByTestId("selected-path-empty")).toHaveTextContent(
            "Select a team, theme, subcategory or repository",
        );
    });

    it("shows allocated, share (with its base), baseline share and change", () => {
        render(
            <SelectedPathPanel
                selection={{ kind: "repo", label: "dev-health-ops" }}
                numbers={numbers}
                {...base}
            />,
        );
        expect(screen.getByTestId("selected-path-title")).toHaveTextContent("dev-health-ops");
        expect(screen.getByTestId("selected-path-allocated")).toHaveTextContent("12.3 work units");
        expect(screen.getByText("Share of all allocation")).toBeInTheDocument();
        expect(screen.getByTestId("selected-path-share")).toHaveTextContent("25%");
        expect(screen.getByTestId("selected-path-baseline")).toHaveTextContent("20%");
        expect(screen.getByTestId("selected-path-change")).toHaveTextContent(
            "+5 percentage points",
        );
    });

    it("a view without a baseline says so; never 0%", () => {
        render(
            <SelectedPathPanel
                selection={{ kind: "repo", label: "r" }}
                numbers={{ ...numbers, baselineShare: null, changePp: null }}
                {...base}
                hasBaseline={false}
            />,
        );
        expect(screen.getByTestId("selected-path-baseline")).toHaveTextContent(
            "not available for this view",
        );
        expect(screen.getByTestId("selected-path-change")).toHaveTextContent("not available");
        expect(screen.getByTestId("selected-path-baseline")).not.toHaveTextContent("0%");
    });

    it("a measured 0% baseline shows 0%, a missing one says not available", () => {
        const { rerender } = render(
            <SelectedPathPanel
                selection={{ kind: "repo", label: "r" }}
                numbers={{ ...numbers, baselineShare: 0, changePp: 25 }}
                {...base}
            />,
        );
        expect(screen.getByTestId("selected-path-baseline")).toHaveTextContent("0%");
        rerender(
            <SelectedPathPanel
                selection={{ kind: "repo", label: "r" }}
                numbers={{ ...numbers, baselineShare: null, changePp: null }}
                {...base}
            />,
        );
        expect(screen.getByTestId("selected-path-baseline")).toHaveTextContent("not available");
    });

    it("labels the share's base, and shows no share when there is no honest one", () => {
        render(
            <SelectedPathPanel
                selection={{ kind: "theme", label: "Risk" }}
                numbers={numbers}
                {...base}
                shareUnavailableReason="A theme drill holds only that theme."
            />,
        );
        expect(screen.getByTestId("selected-path-share")).toHaveTextContent("not shown");
        expect(screen.getByTestId("selected-path-change")).toHaveTextContent("not available");
        expect(screen.getByText("A theme drill holds only that theme.")).toBeInTheDocument();
    });

    it("carries the attribution inset and ONE primary action, 'Inspect allocation evidence', to the Evidence tab", () => {
        render(
            <SelectedPathPanel
                selection={{ kind: "team", label: "Alpha" }}
                numbers={numbers}
                {...base}
            />,
        );
        const inset = screen.getByTestId("selected-path-inset");
        expect(inset).toHaveTextContent("Attribution, not dependency");
        expect(inset).toHaveTextContent("appears to land");
        // Washed inset (prototype `.inset`), not a left-rule quote.
        expect(inset.className).toContain("bg-background");
        expect(inset.className).not.toContain("border-l");

        const link = screen.getByRole("link", { name: "Inspect allocation evidence" });
        expect(link).toHaveAttribute("href", "/investment?tab=evidence&f=abc");
        expect(link.className).toContain("bg-(--action)");
        expect(link.className).not.toContain("uppercase");
        // The arrow comes before the text.
        expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(screen.getAllByRole("link")).toHaveLength(1);
        expect(screen.queryByRole("link", { name: /open evidence/i })).toBeNull();
    });

    it("keeps the inset and the action with no selection", () => {
        render(<SelectedPathPanel selection={null} numbers={null} {...base} />);
        expect(screen.getByTestId("selected-path-empty")).toBeInTheDocument();
        expect(screen.getByTestId("selected-path-inset")).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: "Inspect allocation evidence" }),
        ).toBeInTheDocument();
    });
});
