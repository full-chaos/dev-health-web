import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ScopeBarClient, type ScopeBarClientProps } from "./ScopeBarClient";
import { FILTER_OPTIONS, scopeBarUrl } from "@/test/scopeBarHarness";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: scopeBarUrl.replace, push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => scopeBarUrl.pathname,
    useSearchParams: () => new URLSearchParams(scopeBarUrl.search),
}));
vi.mock("@/components/filters/useFilterOptions", () => ({
    useFilterOptions: () => FILTER_OPTIONS,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const DEFAULT_F =
    "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjE0LCJyYW5nZV9kYXlzIjoxNH0sIndoYXQiOnt9LCJ3aG8iOnt9LCJ3aHkiOnt9fQ";

const HOME: ScopeBarClientProps = {
    view: "home",
    resolvedVisibility: { developer: true, workType: true, flowStage: false },
    resolvedScopeLock: "team",
};

function filtersButton() {
    return screen.getByRole("button", { name: /^Filters/ });
}

function setViewport(wide: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: wide,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
    scopeBarUrl.reset(`f=${DEFAULT_F}`);
    setViewport(true);
});

describe("Filter drawer — a modal dialog from the md breakpoint up", () => {
    it("opens from the Filters button as a labelled modal dialog", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);
        expect(filtersButton()).toHaveAttribute("aria-expanded", "false");

        await user.click(filtersButton());

        const dialog = screen.getByRole("dialog", { name: "Filters" });
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAttribute("data-mode", "drawer");
        expect(filtersButton()).toHaveAttribute("aria-expanded", "true");
        expect(filtersButton()).toHaveAttribute("aria-controls", dialog.id);
        expect(screen.getByTestId("filter-drawer-backdrop")).toBeInTheDocument();
    });

    it("holds the page filters: the Developer and Work menus and the Who and Why sections", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);

        await user.click(filtersButton());

        const dialog = within(screen.getByRole("dialog", { name: "Filters" }));
        expect(dialog.getByRole("button", { name: /^Developer/ })).toBeInTheDocument();
        expect(dialog.getByRole("button", { name: /^Work/ })).toBeInTheDocument();
        expect(dialog.getByText("Who")).toBeInTheDocument();
        expect(dialog.getByText("Why")).toBeInTheDocument();
        // The Cockpit view has no flow filter.
        expect(dialog.queryByRole("button", { name: /^Flow/ })).toBeNull();
    });

    it("moves focus into the dialog on open", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);

        await user.click(filtersButton());

        const dialog = screen.getByRole("dialog", { name: "Filters" });
        expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus();
    });

    it("keeps Tab and Shift+Tab inside the dialog", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);
        await user.click(filtersButton());
        const dialog = screen.getByRole("dialog", { name: "Filters" });
        const close = within(dialog).getByRole("button", { name: "Close" });

        // The Close button is the first focusable element: Shift+Tab wraps to the last.
        await user.tab({ shift: true });
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
        expect(close).not.toHaveFocus();
        const last = document.activeElement;

        // Tab from the last wraps to the first.
        await user.tab();
        expect(close).toHaveFocus();

        // A full cycle never leaves the dialog.
        for (let step = 0; step < 12; step += 1) {
            await user.tab();
            expect(dialog).toContainElement(document.activeElement as HTMLElement);
        }
        expect(last).not.toBeNull();
    });

    it("closes on Escape and returns focus to the Filters button", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);
        await user.click(filtersButton());

        await user.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(filtersButton()).toHaveFocus();
        expect(filtersButton()).toHaveAttribute("aria-expanded", "false");
    });

    it("closes on the Close button and on the backdrop, and returns focus each time", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);

        await user.click(filtersButton());
        await user.click(
            within(screen.getByRole("dialog", { name: "Filters" })).getByRole("button", {
                name: "Close",
            }),
        );
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(filtersButton()).toHaveFocus();

        await user.click(filtersButton());
        await user.click(screen.getByTestId("filter-drawer-backdrop"));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(filtersButton()).toHaveFocus();
    });

    it("can be opened, used and closed with the keyboard only", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);

        filtersButton().focus();
        await user.keyboard("{Enter}");
        const dialog = screen.getByRole("dialog", { name: "Filters" });

        // Close → Developer menu button: open it with the keyboard and pick an option.
        await user.tab();
        expect(within(dialog).getByRole("button", { name: /^Developer/ })).toHaveFocus();
        await user.keyboard("{Enter}");
        await user.tab();
        await user.tab();
        expect(screen.getByRole("checkbox", { name: "ana@example.com" })).toHaveFocus();
        await user.keyboard(" ");

        expect(scopeBarUrl.lastFilter().who.developers).toEqual(["ana@example.com"]);

        // Escape closes the open menu first; focus stays inside the drawer.
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("checkbox", { name: "ana@example.com" })).toBeNull();
        const stillOpen = screen.getByRole("dialog", { name: "Filters" });
        expect(stillOpen).toContainElement(document.activeElement as HTMLElement);
        // A second Escape closes the drawer.
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(filtersButton()).toHaveFocus();
    });
});

describe("Filter drawer — changes apply at once", () => {
    it("writes `f` while the user types, with no Apply and no Cancel", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);
        await user.click(filtersButton());
        const dialog = within(screen.getByRole("dialog", { name: "Filters" }));

        expect(dialog.queryByRole("button", { name: /apply/i })).toBeNull();
        expect(dialog.queryByRole("button", { name: /cancel/i })).toBeNull();

        await user.click(dialog.getByText("Who"));
        await user.type(
            dialog.getByPlaceholderText("alice@example.com, bob@example.com"),
            "ana@example.com",
        );

        await waitFor(() =>
            expect(scopeBarUrl.lastFilter().who.developers).toEqual(["ana@example.com"]),
        );
        // The drawer stays open, and the count is in the button's name.
        expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Filters, 1 active" })).toBeInTheDocument();
    });

    it("applies a menu choice at once", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);
        await user.click(filtersButton());
        const dialog = within(screen.getByRole("dialog", { name: "Filters" }));

        await user.click(dialog.getByRole("button", { name: /^Work/ }));
        await user.click(dialog.getByRole("checkbox", { name: "feature" }));

        expect(scopeBarUrl.lastFilter().why.work_category).toEqual(["feature"]);
        expect(dialog.getByRole("checkbox", { name: "feature" })).toBeChecked();
    });
});

describe("Filter panel — below the md breakpoint it stays an inline panel", () => {
    beforeEach(() => {
        setViewport(false);
    });

    it("opens under the bar as a region, not as a modal dialog", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);

        await user.click(filtersButton());

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByTestId("filter-drawer-backdrop")).toBeNull();
        const panel = screen.getByRole("region", { name: "Filters" });
        expect(panel).toHaveAttribute("data-mode", "inline");
        expect(screen.getByTestId("scope-bar")).toContainElement(panel);
        expect(filtersButton()).toHaveAttribute("aria-expanded", "true");
    });

    it("closes when the Filters button is pressed again", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);

        await user.click(filtersButton());
        await user.click(filtersButton());

        expect(screen.queryByRole("region", { name: "Filters" })).toBeNull();
        expect(filtersButton()).toHaveAttribute("aria-expanded", "false");
    });
});
