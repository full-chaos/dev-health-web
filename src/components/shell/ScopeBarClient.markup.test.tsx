import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ScopeBar } from "./ScopeBar";
import { FILTER_OPTIONS, scopeBarUrl } from "@/test/scopeBarHarness";

/**
 * Markup of the scope bar, taken before the card was extracted into
 * `ScopeBarFrame`. The refactor must not change one element, attribute or
 * class: these snapshots are the proof. Do not update them for a refactor.
 */

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
const ALL_DIMENSIONS_F =
    "eyJob3ciOnsiYmxvY2tlZCI6dHJ1ZSwiZmxvd19zdGFnZSI6WyJyZXZpZXciXX0sInNjb3BlIjp7ImlkcyI6WyJwbGF0Zm9ybSJdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjMwLCJyYW5nZV9kYXlzIjozMH0sIndoYXQiOnsiYXJ0aWZhY3RzIjpbInByIiwiaXNzdWUiXSwicmVwb3MiOlsib3JnL2FwaSIsIm9yZy93ZWIiXX0sIndobyI6eyJkZXZlbG9wZXJzIjpbImFuYUBleGFtcGxlLmNvbSIsImJvQGV4YW1wbGUuY29tIl0sInJvbGVzIjpbInJldmlld2VyIl19LCJ3aHkiOnsiaXNzdWVfdHlwZSI6WyJidWciXSwid29ya19jYXRlZ29yeSI6WyJmZWF0dXJlIl19fQ";

function markup(container: HTMLElement) {
    return container.innerHTML;
}

beforeEach(() => {
    scopeBarUrl.reset(`f=${DEFAULT_F}`);
    window.history.replaceState({}, "", `/dashboard?f=${DEFAULT_F}`);
});

describe("ScopeBar markup — unchanged by the frame extraction", () => {
    it("a view with page filters, default filter", () => {
        const { container } = render(<ScopeBar view="home" orgName="Test" />);

        expect(markup(container)).toMatchSnapshot();
    });

    it("a view with page filters, every filter dimension active (pills and count)", () => {
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        const { container } = render(<ScopeBar view="metrics" tab="flow" orgName="Test" />);

        expect(markup(container)).toMatchSnapshot();
    });

    it("the filter drawer open", async () => {
        const user = userEvent.setup();
        const { container } = render(<ScopeBar view="home" orgName="Test" />);

        await user.click(screen.getByRole("button", { name: "Filters" }));
        await screen.findByTestId("filter-drawer");

        expect(markup(container)).toMatchSnapshot();
    });

    it("an open team menu in the row", async () => {
        const user = userEvent.setup();
        const { container } = render(<ScopeBar view="home" orgName="Test" />);

        await user.click(screen.getByRole("button", { name: /^Team/ }));

        expect(markup(container)).toMatchSnapshot();
    });

    it("the People view (search and the Developer menu in the row)", () => {
        scopeBarUrl.reset(`f=${DEFAULT_F}&q=ana`);
        const { container } = render(<ScopeBar view="people" orgName="Test" />);

        expect(markup(container)).toMatchSnapshot();
    });

    it("a view with no page filter, no `f`, with the origin", () => {
        scopeBarUrl.reset("");
        const { container } = render(<ScopeBar view="complexity" origin="Home" orgName="Test" />);

        expect(markup(container)).toMatchSnapshot();
    });

    it("pageFilters={false}", () => {
        const { container } = render(<ScopeBar pageFilters={false} orgName="Test" />);

        expect(markup(container)).toMatchSnapshot();
    });

    it("the copy-link fallback field", async () => {
        const user = userEvent.setup();
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText: () => Promise.reject(new Error("denied")) },
            configurable: true,
        });
        const { container } = render(<ScopeBar view="home" orgName="Test" />);

        await user.click(screen.getByRole("button", { name: "Copy link" }));
        await waitFor(() => expect(screen.getByTestId("scope-bar-copy-fallback")).toBeVisible());

        expect(markup(container)).toMatchSnapshot();
    });
});
