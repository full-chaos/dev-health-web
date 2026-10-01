import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import { ShellOrganizationProvider } from "./ShellContext";
import { ScopeBarClient, type ScopeBarClientProps } from "./ScopeBarClient";
import { FILTER_OPTIONS, scopeBarUrl } from "@/test/scopeBarHarness";

const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: scopeBarUrl.replace, push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => scopeBarUrl.pathname,
    useSearchParams: () => new URLSearchParams(scopeBarUrl.search),
}));
vi.mock("@/components/filters/useFilterOptions", () => ({
    useFilterOptions: () => FILTER_OPTIONS,
}));
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

// Encoded by the encoder as it was before the scope bar (see filterParamCompat.test.ts).
const DEFAULT_F =
    "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjE0LCJyYW5nZV9kYXlzIjoxNH0sIndoYXQiOnt9LCJ3aG8iOnt9LCJ3aHkiOnt9fQ";
const CUSTOM_DATES_F =
    "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjIxLCJlbmRfZGF0ZSI6IjIwMjYtMDktMjEiLCJyYW5nZV9kYXlzIjoyMSwic3RhcnRfZGF0ZSI6IjIwMjYtMDktMDEifSwid2hhdCI6e30sIndobyI6e30sIndoeSI6e319";
const ALL_DIMENSIONS_F =
    "eyJob3ciOnsiYmxvY2tlZCI6dHJ1ZSwiZmxvd19zdGFnZSI6WyJyZXZpZXciXX0sInNjb3BlIjp7ImlkcyI6WyJwbGF0Zm9ybSJdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjMwLCJyYW5nZV9kYXlzIjozMH0sIndoYXQiOnsiYXJ0aWZhY3RzIjpbInByIiwiaXNzdWUiXSwicmVwb3MiOlsib3JnL2FwaSIsIm9yZy93ZWIiXX0sIndobyI6eyJkZXZlbG9wZXJzIjpbImFuYUBleGFtcGxlLmNvbSIsImJvQGV4YW1wbGUuY29tIl0sInJvbGVzIjpbInJldmlld2VyIl19LCJ3aHkiOnsiaXNzdWVfdHlwZSI6WyJidWciXSwid29ya19jYXRlZ29yeSI6WyJmZWF0dXJlIl19fQ";

const HOME: ScopeBarClientProps = {
    view: "home",
    resolvedVisibility: { developer: true, workType: true, flowStage: false },
    resolvedScopeLock: "team",
};

function renderBar(props: Partial<ScopeBarClientProps> = {}) {
    return render(<ScopeBarClient {...HOME} {...props} />);
}

function row() {
    return screen.getByTestId("scope-bar-row");
}

function stubClipboard(writeText: (value: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
}

beforeEach(() => {
    scopeBarUrl.reset(`f=${DEFAULT_F}`);
    toastSuccess.mockClear();
    window.history.replaceState({}, "", `/dashboard?f=${DEFAULT_F}`);
});

describe("ScopeBar — one row", () => {
    it("is one labelled region with organization, team, repository, window and the actions in one row", () => {
        renderBar({ orgName: "Test" });

        expect(screen.getByRole("region", { name: "Scope" })).toBe(screen.getByTestId("scope-bar"));
        const inRow = within(row());
        expect(inRow.getByRole("button", { name: "Test" })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: /^Team/ })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: /^Repo/ })).toBeInTheDocument();
        expect(
            within(inRow.getByRole("group", { name: "Window" }))
                .getAllByRole("button")
                .map((button) => button.textContent),
        ).toEqual(["7d", "14d", "30d", "90d"]);
        expect(inRow.getByRole("button", { name: "Filters" })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: "Reset filters" })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    });

    it("keeps the page filters out of the row: they are in the drawer", () => {
        renderBar();

        expect(screen.queryByRole("button", { name: /^Developer/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Work/ })).toBeNull();
        expect(screen.queryByTestId("filter-drawer")).toBeNull();
    });

    it("takes the organization name from the shell, then from the prop, then a neutral word", () => {
        const { unmount } = render(
            <ShellOrganizationProvider value={{ name: "Acme", hasData: true, lastMetricsAt: null }}>
                <ScopeBarClient {...HOME} />
            </ShellOrganizationProvider>,
        );
        expect(within(row()).getByRole("button", { name: "Acme" })).toBeInTheDocument();
        unmount();

        const second = renderBar({ orgName: "From prop" });
        expect(within(row()).getByRole("button", { name: "From prop" })).toBeInTheDocument();
        second.unmount();

        renderBar();
        expect(within(row()).getByRole("button", { name: "Organization" })).toBeInTheDocument();
    });

    it("shows the origin when the page passes one", () => {
        renderBar({ origin: "Cockpit" });

        expect(within(row()).getByText("Origin")).toBeInTheDocument();
        expect(within(row()).getByText("Cockpit")).toBeInTheDocument();
    });
});

describe("ScopeBar — each action writes the same `f` the old bars wrote", () => {
    it("adds the default `f` when the URL has none, and keeps the other params", () => {
        scopeBarUrl.reset("role=em");
        renderBar();

        expect(scopeBarUrl.lastParams().get("f")).toBe(DEFAULT_F);
        expect(scopeBarUrl.lastParams().get("role")).toBe("em");
    });

    it("writes nothing on load when the URL has `f`", () => {
        renderBar();

        expect(scopeBarUrl.replace).not.toHaveBeenCalled();
    });

    it("window: sets range and compare days, removes custom dates, keeps role, lens, tab and q", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${CUSTOM_DATES_F}&role=em&lens=pm&tab=flow&q=ana`);
        renderBar();

        await user.click(screen.getByRole("button", { name: "90d" }));

        expect(scopeBarUrl.lastFilter()).toEqual({
            ...defaultMetricFilter,
            time: { range_days: 90, compare_days: 90 },
        });
        const params = scopeBarUrl.lastParams();
        expect(params.get("role")).toBe("em");
        expect(params.get("lens")).toBe("pm");
        expect(params.get("tab")).toBe("flow");
        expect(params.get("q")).toBe("ana");
        expect(screen.getByRole("button", { name: "90d" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "14d" })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
    });

    it("team: sets the team scope", async () => {
        const user = userEvent.setup();
        renderBar();

        await user.click(screen.getByRole("button", { name: /^Team/ }));
        await user.click(screen.getByRole("checkbox", { name: "platform" }));

        expect(scopeBarUrl.lastFilter().scope).toEqual({ level: "team", ids: ["platform"] });
        expect(screen.getByRole("button", { name: /^Team/ })).toHaveTextContent("platform");
    });

    it("repository: sets what.repos and shows a pill that clears it", async () => {
        const user = userEvent.setup();
        renderBar();

        await user.click(screen.getByRole("button", { name: /^Repo/ }));
        await user.click(screen.getByRole("checkbox", { name: "org/api" }));
        expect(scopeBarUrl.lastFilter().what).toEqual({ repos: ["org/api"] });

        await user.click(screen.getByRole("button", { name: "Remove Repo filter" }));
        expect(scopeBarUrl.lastFilter().what).toEqual({ repos: [] });
    });

    it("organization on a view with no scope lock: sets the org level", async () => {
        const user = userEvent.setup();
        renderBar({ orgName: "Test", resolvedScopeLock: null });

        await user.click(screen.getByRole("button", { name: "Test" }));

        expect(scopeBarUrl.lastFilter().scope).toEqual({ level: "org", ids: [] });
        expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("organization on a team-locked view (the Cockpit): clears the teams, as the two old bars did together", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        renderBar({ orgName: "Test" });

        await user.click(screen.getByRole("button", { name: "Test" }));

        await waitFor(() =>
            expect(scopeBarUrl.lastFilter().scope).toEqual({ level: "team", ids: [] }),
        );
        expect(scopeBarUrl.lastFilter().who).toEqual(decodeFilter(ALL_DIMENSIONS_F).who);
    });

    it("reset: writes the default filter and keeps the other params", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}&role=em&lens=pm`);
        renderBar();

        await user.click(screen.getByRole("button", { name: "Reset filters" }));

        expect(scopeBarUrl.lastParams().get("f")).toBe(encodeFilterParam(defaultMetricFilter));
        expect(scopeBarUrl.lastParams().get("f")).toBe(DEFAULT_F);
        expect(scopeBarUrl.lastParams().get("role")).toBe("em");
        expect(scopeBarUrl.lastParams().get("lens")).toBe("pm");
    });
});

describe("ScopeBar — Filters button and active filters", () => {
    it("is named exactly 'Filters' when no drawer filter is active", () => {
        renderBar();

        expect(screen.getByRole("button", { name: /^Filters$/ })).toBeInTheDocument();
        expect(screen.queryByTestId("scope-bar-filter-count")).toBeNull();
    });

    it("says the active count in its accessible name, not only as a badge", () => {
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        renderBar();

        // 2 developers + 1 role + 1 work category + 1 issue type + 1 flow stage + 2 artifacts + blocked.
        const button = screen.getByRole("button", { name: "Filters, 9 active" });
        const badge = screen.getByTestId("scope-bar-filter-count");
        expect(button).toContainElement(badge);
        expect(badge).toHaveTextContent("9");
        expect(badge).toHaveAttribute("aria-hidden", "true");
    });

    it("does not count team, repository and window: they are in the row", async () => {
        const user = userEvent.setup();
        renderBar();

        await user.click(screen.getByRole("button", { name: "90d" }));
        await user.click(screen.getByRole("button", { name: /^Repo/ }));
        await user.click(screen.getByRole("checkbox", { name: "org/api" }));

        expect(screen.getByRole("button", { name: /^Filters$/ })).toBeInTheDocument();
    });

    it("shows the active filters as pills, and a pill clears its filter", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        renderBar();

        const bar = within(screen.getByTestId("scope-bar"));
        expect(bar.getByText("ana@example.com")).toBeInTheDocument();
        expect(bar.getByText("feature")).toBeInTheDocument();

        // Two developers are active: the first pill is "ana@example.com".
        await user.click(bar.getAllByRole("button", { name: "Remove Dev filter" })[0]);

        expect(scopeBarUrl.lastFilter().who.developers).toEqual(["bo@example.com"]);
        expect(screen.getByRole("button", { name: "Filters, 8 active" })).toBeInTheDocument();
    });
});

describe("ScopeBar — Copy link", () => {
    it("copies the full current URL, with f, role and lens, and confirms it", async () => {
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue(undefined);
        stubClipboard(writeText);
        window.history.replaceState({}, "", `/dashboard?f=${ALL_DIMENSIONS_F}&role=em&lens=pm`);
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}&role=em&lens=pm`);
        renderBar();

        await user.click(screen.getByRole("button", { name: "Copy link" }));

        expect(writeText).toHaveBeenCalledTimes(1);
        const copied = writeText.mock.calls[0][0] as string;
        expect(copied).toBe(window.location.href);
        expect(copied).toBe(
            `${window.location.origin}/dashboard?f=${ALL_DIMENSIONS_F}&role=em&lens=pm`,
        );
        await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Link copied"));
        expect(screen.queryByTestId("scope-bar-copy-fallback")).toBeNull();
    });

    it.each([
        [
            "the clipboard refuses the write",
            () => stubClipboard(vi.fn().mockRejectedValue(new Error("denied"))),
        ],
        [
            "there is no clipboard",
            () =>
                Object.defineProperty(navigator, "clipboard", {
                    value: undefined,
                    configurable: true,
                }),
        ],
    ])(
        "shows the URL in a selected field when %s: never a silent no-op",
        async (_label, arrange) => {
            const user = userEvent.setup();
            arrange();
            window.history.replaceState({}, "", `/dashboard?f=${DEFAULT_F}&role=em&lens=pm`);
            renderBar();

            await user.click(screen.getByRole("button", { name: "Copy link" }));

            const field = (await screen.findByRole("textbox", {
                name: /could not be copied/i,
            })) as HTMLInputElement;
            expect(field.value).toBe(window.location.href);
            expect(field.value).toContain("role=em");
            expect(field.value).toContain("lens=pm");
            expect(field).toHaveAttribute("readonly");
            await waitFor(() => expect(field).toHaveFocus());
            expect(field.selectionStart).toBe(0);
            expect(field.selectionEnd).toBe(field.value.length);
            expect(toastSuccess).not.toHaveBeenCalled();

            await user.click(
                within(screen.getByTestId("scope-bar-copy-fallback")).getByRole("button", {
                    name: "Close",
                }),
            );
            expect(screen.queryByTestId("scope-bar-copy-fallback")).toBeNull();
        },
    );
});

describe("ScopeBar — People view", () => {
    const PEOPLE: ScopeBarClientProps = {
        view: "people",
        resolvedVisibility: { developer: true, workType: false, flowStage: false },
        resolvedScopeLock: "team",
    };

    it("has the person search in the row and no filter drawer", () => {
        render(<ScopeBarClient {...PEOPLE} />);

        expect(within(row()).getByRole("textbox", { name: "Search" })).toHaveAttribute(
            "placeholder",
            "Name or handle",
        );
        expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
        expect(within(row()).getByRole("button", { name: /^Team/ })).toBeInTheDocument();
    });

    it("writes the search to `q` and keeps `f`", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}&role=em`);
        render(<ScopeBarClient {...PEOPLE} />);

        await user.type(screen.getByRole("textbox", { name: "Search" }), "an");

        const params = scopeBarUrl.lastParams();
        expect(params.get("q")).toBe("an");
        expect(params.get("f")).toBe(ALL_DIMENSIONS_F);
        expect(params.get("role")).toBe("em");
    });

    it("shows the search from the URL, and Reset clears it with the filters", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}&q=ana`);
        render(<ScopeBarClient {...PEOPLE} />);
        expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("ana");

        await user.click(screen.getByRole("button", { name: "Reset filters" }));

        expect(scopeBarUrl.lastParams().has("q")).toBe(false);
        expect(scopeBarUrl.lastParams().get("f")).toBe(DEFAULT_F);
    });

    it("keeps the Developer menu in the row, where the People filter bar had it", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...PEOPLE} />);

        await user.click(within(row()).getByRole("button", { name: /^Developer/ }));
        await user.click(screen.getByRole("checkbox", { name: "ana@example.com" }));

        expect(scopeBarUrl.lastFilter().who.developers).toEqual(["ana@example.com"]);
        // The choice is visible as a pill, and it can be cleared there.
        await user.click(screen.getByRole("button", { name: "Remove Dev filter" }));
        expect(scopeBarUrl.lastFilter().who.developers).toEqual([]);
    });

    it("keeps the page filter menus out of the row on a view that has the drawer", () => {
        renderBar();

        expect(within(row()).queryByRole("button", { name: /^Developer/ })).toBeNull();
        expect(within(row()).queryByRole("button", { name: /^Work/ })).toBeNull();
    });

    it("has no person search on another view", () => {
        renderBar();

        expect(screen.queryByRole("textbox", { name: "Search" })).toBeNull();
    });
});
