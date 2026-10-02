import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";

import { ShellOrganizationProvider } from "./ShellContext";
import { ScopeBar } from "./ScopeBar";
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
    resolvedVisibility: {
        developer: true,
        workType: true,
        unreadFilters: [],
    },
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
        // Prototype `.scope-item`: plain label + value triggers (no pill border), dividers, a
        // plain window row whose active button has a wash.
        const team = inRow.getByRole("button", { name: /^Team/ });
        expect(team.className).not.toContain("border");
        expect(team.querySelector("svg.lucide-chevron-down")).not.toBeNull();
        expect(inRow.getByRole("button", { name: "Test" }).className).not.toContain("border");
        const windowGroup = inRow.getByRole("group", { name: "Window" });
        expect(
            within(windowGroup)
                .getAllByRole("button")
                .find((button) => button.getAttribute("aria-pressed") === "true")?.className,
        ).toContain("bg-(--accent-wash)");
        expect(windowGroup.className).not.toContain("border");
        expect(row().querySelectorAll("span.w-px")).toHaveLength(3);
        const filters = inRow.getByRole("button", { name: "Filters" });
        // Prototype `scopebar()`: Filters is ghost small with the filter icon.
        expect(filters.querySelector("svg.lucide-list-filter")).not.toBeNull();
        expect(filters.className).toContain("bg-transparent");
        expect(filters.className).toContain("min-h-7");
        expect(inRow.getByRole("button", { name: "Reset" })).toBeInTheDocument();
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
        renderBar({ origin: "Home" });

        expect(within(row()).getByText("Origin")).toBeInTheDocument();
        expect(within(row()).getByText("Home")).toBeInTheDocument();
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

    it("organization on a team-locked view (the Home): clears the teams, as the two old bars did together", async () => {
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

        await user.click(screen.getByRole("button", { name: "Reset" }));

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

        // 2 developers + 1 work category. The old URL also holds a role, an issue type, a flow
        // stage, artifacts and blocked: those filters are gone (CHAOS-7799) and are not counted.
        const button = screen.getByRole("button", { name: "Filters, 3 active" });
        const badge = screen.getByTestId("scope-bar-filter-count");
        expect(button).toContainElement(badge);
        expect(badge).toHaveTextContent("3");
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
        expect(screen.getByRole("button", { name: "Filters, 2 active" })).toBeInTheDocument();
    });

    it("shows no pill for the removed filters left in an old URL (CHAOS-7795, CHAOS-7799)", () => {
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        renderBar();

        const bar = within(screen.getByTestId("scope-bar"));
        // The URL holds roles, artifacts, an issue type, a flow stage and blocked.
        for (const gone of ["reviewer", "pr", "issue", "bug", "review", "Blocked"]) {
            expect(bar.queryByText(gone), gone).toBeNull();
        }
        expect(bar.getByText("ana@example.com")).toBeInTheDocument();
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
        resolvedVisibility: { developer: true, workType: false },
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
        // `f` is kept; the five removed filters in an old URL are not written back (CHAOS-7799).
        expect(scopeBarUrl.lastFilter()).toEqual(decodeFilter(ALL_DIMENSIONS_F));
        expect(scopeBarUrl.lastFilter().who).toEqual({
            developers: ["ana@example.com", "bo@example.com"],
        });
        expect(params.get("role")).toBe("em");
    });

    it("shows the search from the URL, and Reset clears it with the filters", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}&q=ana`);
        render(<ScopeBarClient {...PEOPLE} />);
        expect(screen.getByRole("textbox", { name: "Search" })).toHaveValue("ana");

        await user.click(screen.getByRole("button", { name: "Reset" }));

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

describe("ScopeBar — a view with no page filter (Complexity, Cognitive Load)", () => {
    it.each(["complexity", "cognitive-load"] as const)(
        "%s: the organization can be selected and stays selected, as with the global context bar",
        async (view) => {
            const user = userEvent.setup();
            render(<ScopeBar view={view} orgName="Test" />);
            const organization = screen.getByRole("button", { name: "Test" });
            expect(organization).toHaveAttribute("aria-pressed", "false");

            await user.click(organization);

            await waitFor(() => expect(organization).toHaveAttribute("aria-pressed", "true"));
            // One write: no scope lock puts the team level back.
            expect(scopeBarUrl.replace).toHaveBeenCalledTimes(1);
            expect(scopeBarUrl.lastFilter().scope).toEqual({ level: "org", ids: [] });
        },
    );

    it("has no Filters button and no page filter menu", () => {
        render(<ScopeBar view="complexity" />);

        expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Developer/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Work/ })).toBeNull();
        expect(within(row()).getByRole("button", { name: /^Team/ })).toBeInTheDocument();
        expect(within(row()).getByRole("button", { name: "Reset" })).toBeInTheDocument();
    });

    it("keeps an organization scope from the URL: it is not changed to the team level", () => {
        const orgScope = encodeFilterParam({
            ...defaultMetricFilter,
            scope: { level: "org", ids: [] },
        });
        scopeBarUrl.reset(`f=${orgScope}`);
        render(<ScopeBar view="cognitive-load" orgName="Test" />);

        expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(scopeBarUrl.replace).not.toHaveBeenCalled();
    });

    it.each(["complexity", "cognitive-load"] as const)(
        "%s: writes nothing on first load with no `f`, and the organization is selected",
        async (view) => {
            scopeBarUrl.reset("role=em");
            render(<ScopeBar view={view} orgName="Test" />);

            expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute(
                "aria-pressed",
                "true",
            );
            expect(within(row()).getByRole("button", { name: /^Team/ })).toHaveTextContent("All");
            // The default `f` is written in an effect: give it time to run.
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(scopeBarUrl.replace).not.toHaveBeenCalled();
        },
    );

    it("reads the scope from the query params when the URL has no `f`, as the page does", () => {
        scopeBarUrl.reset("scope_type=team&scope_id=platform&range_days=30");
        render(<ScopeBar view="complexity" orgName="Test" />);

        expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
        expect(within(row()).getByRole("button", { name: /^Team/ })).toHaveTextContent("platform");
        expect(
            within(screen.getByRole("group", { name: "Window" })).getByRole("button", {
                name: "30d",
            }),
        ).toHaveAttribute("aria-pressed", "true");
        expect(scopeBarUrl.replace).not.toHaveBeenCalled();
    });

    it("a window change with no `f` writes the organization scope with the new window, as the global context bar did", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset("role=em");
        render(<ScopeBar view="complexity" />);

        await user.click(screen.getByRole("button", { name: "90d" }));

        expect(scopeBarUrl.replace).toHaveBeenCalledTimes(1);
        expect(scopeBarUrl.lastFilter().scope).toEqual({ level: "org", ids: [] });
        expect(scopeBarUrl.lastFilter().time).toEqual({ range_days: 90, compare_days: 90 });
        expect(scopeBarUrl.lastParams().get("role")).toBe("em");
    });

    it("reset goes back to the first-load state: no `f`, the organization selected, other params kept", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}&role=em`);
        render(<ScopeBar view="complexity" orgName="Test" />);
        expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute(
            "aria-pressed",
            "false",
        );

        await user.click(screen.getByRole("button", { name: "Reset" }));

        expect(scopeBarUrl.lastParams().has("f")).toBe(false);
        expect(scopeBarUrl.lastParams().get("role")).toBe("em");
        expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
    });

    it("shows the default `f` from the navigation as it is: team level, no team", () => {
        render(<ScopeBar view="complexity" orgName="Test" />);

        expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
        expect(scopeBarUrl.replace).not.toHaveBeenCalled();
    });
});

describe("ScopeBar — a view with page filters keeps the team lock", () => {
    it("the Home view: an organization click ends at the team level", async () => {
        const user = userEvent.setup();
        render(<ScopeBar view="home" orgName="Test" />);

        await user.click(screen.getByRole("button", { name: "Test" }));

        await waitFor(() =>
            expect(scopeBarUrl.lastFilter().scope).toEqual({ level: "team", ids: [] }),
        );
        expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    });

    it("the Home view: adds the default `f` when the URL has none", () => {
        scopeBarUrl.reset("role=em");
        render(<ScopeBar view="home" />);

        expect(scopeBarUrl.lastParams().get("f")).toBe(DEFAULT_F);
        expect(scopeBarUrl.lastParams().get("role")).toBe("em");
    });

    it("the Home view: reset writes the default `f`", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        render(<ScopeBar view="home" />);

        await user.click(screen.getByRole("button", { name: "Reset" }));

        expect(scopeBarUrl.lastParams().get("f")).toBe(DEFAULT_F);
    });
});

describe("ScopeBar — pageFilters={false}", () => {
    it("has the scope row and the actions, with no Filters button and no page filter menu", () => {
        render(<ScopeBar pageFilters={false} orgName="Test" />);

        const inRow = within(row());
        expect(inRow.getByRole("button", { name: "Test" })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: /^Team/ })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: /^Repo/ })).toBeInTheDocument();
        expect(inRow.getByRole("group", { name: "Window" })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: "Reset" })).toBeInTheDocument();
        expect(inRow.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Developer/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Work/ })).toBeNull();
    });

    it("does not lock the scope, also for a view that has the lock by default", async () => {
        const user = userEvent.setup();
        render(<ScopeBar view="home" pageFilters={false} orgName="Test" />);
        const organization = screen.getByRole("button", { name: "Test" });

        await user.click(organization);

        await waitFor(() => expect(organization).toHaveAttribute("aria-pressed", "true"));
        expect(scopeBarUrl.replace).toHaveBeenCalledTimes(1);
        expect(scopeBarUrl.lastFilter().scope).toEqual({ level: "org", ids: [] });
    });

    it("writes nothing on first load with no `f`, and the organization is selected", async () => {
        scopeBarUrl.reset("");
        render(<ScopeBar pageFilters={false} orgName="Test" />);

        expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(scopeBarUrl.replace).not.toHaveBeenCalled();
    });
});

describe("ScopeBar — page-control rows", () => {
    it("renders the rows inside the scope bar card, below the scope row and above the active filters", () => {
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        render(
            <ScopeBar view="home">
                <div data-testid="page-row">Page controls</div>
            </ScopeBar>,
        );

        const rows = screen.getByTestId("scope-bar-rows");
        expect(screen.getByTestId("scope-bar")).toContainElement(rows);
        expect(rows).toContainElement(screen.getByTestId("page-row"));
        expect(row()).not.toContainElement(rows);
        expect(row().compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        // The active filter pills come after the rows.
        const pill = screen
            .getAllByRole("button", { name: /org\/api/ })
            .find((button) => !row().contains(button));
        expect(pill).toBeDefined();
        expect(
            rows.compareDocumentPosition(pill as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("has no rows container when the page gives no row", () => {
        render(<ScopeBar view="home" />);

        expect(screen.queryByTestId("scope-bar-rows")).toBeNull();
    });

    it("keeps one writer of `f` with rows: the rows do not change what the bar writes", async () => {
        const user = userEvent.setup();
        render(
            <ScopeBar view="home">
                <div>Page controls</div>
            </ScopeBar>,
        );

        await user.click(screen.getByRole("button", { name: "90d" }));

        expect(scopeBarUrl.replace).toHaveBeenCalledTimes(1);
        expect(scopeBarUrl.lastFilter().time).toEqual({ range_days: 90, compare_days: 90 });
    });
});

describe("ScopeBar — the AI view: first load as the two old bars had it", () => {
    // Every AI page mounted the global context bar plus the page filter bar for
    // the AI view (it has the work filter), so production locked the scope to
    // the team level and wrote the default `f`. `<ScopeBar view="ai" />` is what
    // every AI page mounts now.
    it("writes the default `f` on first load with no `f`, and keeps the other params", () => {
        scopeBarUrl.reset("role=em");
        render(<ScopeBar view="ai" />);

        expect(scopeBarUrl.lastParams().get("f")).toBe(DEFAULT_F);
        expect(scopeBarUrl.lastParams().get("role")).toBe("em");
    });

    it("keeps the team scope lock: an organization click ends at the team level", async () => {
        const user = userEvent.setup();
        render(<ScopeBar view="ai" orgName="Test" />);

        await user.click(screen.getByRole("button", { name: "Test" }));

        await waitFor(() =>
            expect(scopeBarUrl.lastFilter().scope).toEqual({ level: "team", ids: [] }),
        );
    });

    it("does not show or count a filter from an old URL that no AI query reads (CHAOS-7744)", () => {
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        render(<ScopeBar view="ai" />);

        const bar = within(screen.getByTestId("scope-bar"));
        // In the URL: developers, a role, an issue type, a flow stage, artifacts and blocked.
        for (const hidden of [
            "ana@example.com",
            "bo@example.com",
            "reviewer",
            "bug",
            "review",
            "Blocked",
        ]) {
            expect(bar.queryByText(hidden), hidden).toBeNull();
        }
        // The Work category is read by the AI queries, so it stays and is the only one counted.
        expect(bar.getByText("feature")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Filters, 1 active" })).toBeInTheDocument();
    });

    it("keeps the developer pills and count on a view that reads them, and no issue type pill (CHAOS-7799)", () => {
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        renderBar();

        const bar = within(screen.getByTestId("scope-bar"));
        expect(bar.getByText("ana@example.com")).toBeInTheDocument();
        expect(bar.queryByText("bug")).toBeNull();
        expect(screen.getByRole("button", { name: "Filters, 3 active" })).toBeInTheDocument();
    });

    // `{"why":{"work_category":["feature","maintenance"]}}` on the default team / 14d filter.
    const TWO_CATEGORIES_F =
        "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjE0LCJyYW5nZV9kYXlzIjoxNH0sIndoYXQiOnt9LCJ3aG8iOnt9LCJ3aHkiOnsid29ya19jYXRlZ29yeSI6WyJmZWF0dXJlIiwibWFpbnRlbmFuY2UiXX19";

    it("shows and counts one work category when an old URL holds several: only the first is read (CHAOS-7784)", () => {
        scopeBarUrl.reset(`f=${TWO_CATEGORIES_F}`);
        render(<ScopeBar view="ai" />);

        const bar = within(screen.getByTestId("scope-bar"));
        expect(bar.getByText("feature")).toBeInTheDocument();
        expect(bar.queryByText("maintenance")).toBeNull();
        expect(screen.getByRole("button", { name: "Filters, 1 active" })).toBeInTheDocument();
    });

    it("the Work menu replaces the category instead of adding one", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${TWO_CATEGORIES_F}`);
        render(<ScopeBar view="ai" />);

        await user.click(screen.getByRole("button", { name: /^Filters/ }));
        const drawer = await screen.findByTestId("filter-drawer");
        await user.click(within(drawer).getByRole("button", { name: /^Work/ }));
        await user.click(screen.getByRole("radio", { name: "maintenance" }));

        await waitFor(() =>
            expect(scopeBarUrl.lastFilter().why.work_category).toEqual(["maintenance"]),
        );
    });

    it("the pill clears the category", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(`f=${TWO_CATEGORIES_F}`);
        render(<ScopeBar view="ai" />);

        await user.click(screen.getByRole("button", { name: "Remove Work filter" }));

        await waitFor(() => expect(scopeBarUrl.lastFilter().why.work_category).toEqual([]));
    });

    it("has the Filters drawer with the Work filter and no Developer filter", async () => {
        const user = userEvent.setup();
        render(<ScopeBar view="ai" />);

        expect(within(row()).queryByRole("button", { name: /^Work/ })).toBeNull();
        await user.click(screen.getByRole("button", { name: "Filters" }));
        const drawer = await screen.findByTestId("filter-drawer");

        expect(within(drawer).getByRole("button", { name: /^Work/ })).toBeInTheDocument();
        expect(within(drawer).queryByRole("button", { name: /^Developer/ })).toBeNull();
        expect(screen.getByTestId("scope-bar")).toHaveAttribute("data-view", "ai");
    });
});

describe("ScopeBar — each view offers, shows and counts only the filters its readers use (CHAOS-7796)", () => {
    const hidden = [
        "ana@example.com",
        "bo@example.com",
        "reviewer",
        "bug",
        "review",
        "Blocked",
        "pr",
        "issue",
    ];

    it("home: only the work category is shown and counted (the home path reads repos and work category)", () => {
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        render(<ScopeBar view="home" />);

        const bar = within(screen.getByTestId("scope-bar"));
        for (const text of hidden) expect(bar.queryByText(text), text).toBeNull();
        expect(bar.getByText("feature")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Filters, 1 active" })).toBeInTheDocument();
    });

    it("home: the drawer has the Work filter and no Developer, Who, How or Issue type control", async () => {
        const user = userEvent.setup();
        render(<ScopeBar view="home" />);

        await user.click(screen.getByRole("button", { name: "Filters" }));
        const drawer = await screen.findByTestId("filter-drawer");

        expect(within(drawer).getByRole("button", { name: /^Work/ })).toBeInTheDocument();
        expect(within(drawer).queryByRole("button", { name: /^Developer/ })).toBeNull();
        expect(within(drawer).queryByText("Who")).toBeNull();
        expect(within(drawer).queryByText("How")).toBeNull();
        expect(within(drawer).queryByText("Roles")).toBeNull();
        expect(within(drawer).queryByText("Flow stage")).toBeNull();
        expect(within(drawer).queryByText("Issue type")).toBeNull();
        expect(within(drawer).queryByText("Artifacts")).toBeNull();
    });

    it("metrics Flow tab: no Developer and no Stage control: nothing reads the flow stage", async () => {
        const user = userEvent.setup();
        render(<ScopeBar view="metrics" tab="flow" />);

        await user.click(screen.queryByRole("button", { name: "Filters" }) ?? document.body);
        expect(screen.queryByRole("button", { name: /^Stage/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Developer/ })).toBeNull();
        expect(screen.queryByText("Flow stage")).toBeNull();
    });

    it("landscape: nothing in the drawer is read, so no drawer filters, but the view still has page filters", () => {
        scopeBarUrl.reset("role=em");
        render(<ScopeBar view="landscape" />);

        expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
        // The default `f` is still written: hiding controls does not change the view's page filters.
        expect(scopeBarUrl.lastParams().get("f")).toBe(DEFAULT_F);
    });

    it("investment keeps developers and work category: the investment queries apply them", () => {
        scopeBarUrl.reset(`f=${ALL_DIMENSIONS_F}`);
        render(<ScopeBar view="investment" />);

        const bar = within(screen.getByTestId("scope-bar"));
        expect(bar.getByText("ana@example.com")).toBeInTheDocument();
        expect(bar.getByText("feature")).toBeInTheDocument();
        // Never read, even here: roles, flow stage, blocked, issue type, artifacts.
        for (const text of ["reviewer", "bug", "review", "Blocked", "pr", "issue"]) {
            expect(bar.queryByText(text), text).toBeNull();
        }
        expect(screen.getByRole("button", { name: /Filters, 3 active/ })).toBeInTheDocument();
    });
});
