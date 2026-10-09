import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { useFilterOptions } from "@/components/filters/useFilterOptions";
import { apiClient } from "@/lib/apiClient";
import { scopeBarUrl } from "@/test/scopeBarHarness";

import { ScopeBarClient } from "./ScopeBarClient";

const ID_NAMED = "11111111-1111-4111-8111-111111111111";
const ID_UNNAMED = "22222222-2222-4222-8222-222222222222";
const ID_UNNAMED_TOO = "33333333-3333-4333-8333-333333333333";

const optionsMock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: scopeBarUrl.replace, push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => scopeBarUrl.pathname,
    useSearchParams: () => new URLSearchParams(scopeBarUrl.search),
}));
vi.mock("@/components/filters/useFilterOptions", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/filters/useFilterOptions")>();
    return { useFilterOptions: vi.fn(actual.useFilterOptions) };
});
vi.mock("@/lib/apiClient", () => ({ apiClient: { getJson: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const HOME = {
    view: "home" as const,
    resolvedVisibility: { developer: true, workType: true, unreadFilters: [] },
    resolvedScopeLock: "team" as const,
};

beforeEach(async () => {
    scopeBarUrl.reset();
    optionsMock.value = {
        teams: [ID_NAMED, ID_UNNAMED, ID_UNNAMED_TOO],
        team_names: { [ID_NAMED]: "Payments" },
        repos: [],
        services: [],
        developers: [],
        work_category: [],
    };
    const mod = await import("@/components/filters/useFilterOptions");
    vi.mocked(mod.useFilterOptions).mockImplementation(
        () => optionsMock.value as ReturnType<typeof mod.useFilterOptions>,
    );
});

describe("scope-bar team picker labels", () => {
    it("lists the served name and no row for a team with no name, never the id", async () => {
        const user = userEvent.setup();
        const { container } = render(<ScopeBarClient {...HOME} />);

        await user.click(screen.getByRole("button", { name: /team/i }));

        expect(screen.getByLabelText("Payments")).toBeTruthy();
        expect(screen.queryByLabelText(/^Unresolved/)).toBeNull();
        expect(container.textContent).not.toMatch(/Unresolved/);
        expect(container.textContent).not.toContain(ID_NAMED);
        expect(container.textContent).not.toContain(ID_UNNAMED);
    });

    it("keeps the id as the value written to the URL", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);

        await user.click(screen.getByRole("button", { name: /team/i }));
        await user.click(screen.getByLabelText("Payments"));

        await waitFor(() => expect(scopeBarUrl.lastFilter().scope.ids).toEqual([ID_NAMED]));
    });

    it("labels a team restored from the URL by its name in the trigger", () => {
        const f = btoa(
            JSON.stringify({
                how: {},
                scope: { ids: [ID_NAMED], level: "team" },
                time: { compare_days: 14, range_days: 14 },
                what: {},
                who: {},
                why: {},
            }),
        )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        scopeBarUrl.reset(`f=${f}`);

        const { container } = render(<ScopeBarClient {...HOME} />);

        expect(container.textContent).toContain("Payments");
        expect(container.textContent).not.toContain(ID_NAMED);
    });
});

describe.each([
    ["jira:<uuid>", "jira:44444444-4444-4444-8444-444444444444"],
    ["linear:KEY", "linear:ENG"],
    ["gl:slug", "gl:full-chaos/platform"],
])("scope-bar team picker with a %s team id (CHAOS-8939)", (_form, id) => {
    beforeEach(async () => {
        optionsMock.value = {
            ...optionsMock.value,
            teams: [id, ID_UNNAMED],
            team_names: { [id]: "Platform" },
        };
    });

    it("lists the served name, no row for an unnamed one, and writes the prefixed id", async () => {
        const user = userEvent.setup();
        const { container } = render(<ScopeBarClient {...HOME} />);

        await user.click(screen.getByRole("button", { name: /team/i }));
        expect(screen.queryByLabelText(/^Unresolved/)).toBeNull();
        expect(container.textContent).not.toContain(id);
        await user.click(screen.getByLabelText("Platform"));

        await waitFor(() => expect(scopeBarUrl.lastFilter().scope.ids).toEqual([id]));
    });

    it("labels a team restored from the URL by its name, never its prefixed id", () => {
        const f = btoa(
            JSON.stringify({
                how: {},
                scope: { ids: [id], level: "team" },
                time: { compare_days: 14, range_days: 14 },
                what: {},
                who: {},
                why: {},
            }),
        )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        scopeBarUrl.reset(`f=${f}`);
        const { container } = render(<ScopeBarClient {...HOME} />);

        expect(container.textContent).toContain("Platform");
        expect(container.textContent).not.toContain(id);
    });
});

describe("useFilterOptions", () => {
    it("keeps the served team_names", async () => {
        vi.mocked(apiClient.getJson).mockResolvedValue({
            teams: [ID_NAMED],
            team_names: { [ID_NAMED]: "Payments" },
        });
        const actual = await vi.importActual<
            typeof import("@/components/filters/useFilterOptions")
        >("@/components/filters/useFilterOptions");

        const { result } = renderHook(() => actual.useFilterOptions());

        await waitFor(() => expect(result.current.team_names).toEqual({ [ID_NAMED]: "Payments" }));
    });
});

const urlWithTeams = (ids: string[]) =>
    `f=${btoa(
        JSON.stringify({
            how: {},
            scope: { ids, level: "team" },
            time: { compare_days: 14, range_days: 14 },
            what: {},
            who: {},
            why: {},
        }),
    )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "")}`;

describe("scope-bar team menu with unnamed ids and unassigned (CHAOS-9028)", () => {
    beforeEach(() => {
        optionsMock.value = {
            ...optionsMock.value,
            teams: [ID_UNNAMED, ID_NAMED, "unassigned", ID_UNNAMED_TOO],
        };
    });

    it("lists named teams then the unassigned label last, and no Unresolved row", async () => {
        const user = userEvent.setup();
        const { container } = render(<ScopeBarClient {...HOME} />);

        await user.click(screen.getByRole("button", { name: /team/i }));

        const rows = screen.getAllByRole("checkbox").map((c) => c.parentElement?.textContent);
        expect(rows).toEqual(["All Teams", "Payments", "Unassigned team"]);
        expect(container.textContent).not.toMatch(/Unresolved/);
        expect(container.textContent).not.toContain(ID_UNNAMED);
    });

    it("shows one Unresolved state for an old link with two unnamed ids, no number, no id", () => {
        scopeBarUrl.reset(urlWithTeams([ID_UNNAMED, ID_UNNAMED_TOO]));
        const { container } = render(<ScopeBarClient {...HOME} />);

        expect(container.textContent).toContain("Unresolved");
        expect(container.textContent).not.toMatch(/Unresolved \(\d+\)/);
        expect(container.textContent).not.toContain(ID_UNNAMED);
        expect(container.textContent).not.toContain(ID_UNNAMED_TOO);
    });

    it("keeps the unnamed ids when a named team is added, and All Teams clears them", async () => {
        const user = userEvent.setup();
        scopeBarUrl.reset(urlWithTeams([ID_UNNAMED]));
        render(<ScopeBarClient {...HOME} />);

        await user.click(screen.getByRole("button", { name: /team/i }));
        await user.click(screen.getByLabelText("Payments"));
        await waitFor(() =>
            expect(scopeBarUrl.lastFilter().scope.ids).toEqual([ID_NAMED, ID_UNNAMED]),
        );

        await user.click(screen.getByLabelText("All Teams"));
        await waitFor(() => expect(scopeBarUrl.lastFilter().scope.ids).toEqual([]));
    });
});
