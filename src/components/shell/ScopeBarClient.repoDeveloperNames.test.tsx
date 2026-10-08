import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { apiClient } from "@/lib/apiClient";
import { encodeFilterParam } from "@/lib/filters/encode";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { scopeBarUrl } from "@/test/scopeBarHarness";

import { ScopeBarClient } from "./ScopeBarClient";

const REPO_NAMED = "11111111-1111-4111-8111-111111111111";
const REPO_UNNAMED = "22222222-2222-4222-8222-222222222222";
const ANA = "ana@example.com";
const BO = "bo@example.com";
const CY = "cy@example.com";

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

const PEOPLE = {
    view: "people" as const,
    resolvedVisibility: { developer: true, workType: false },
    resolvedScopeLock: "team" as const,
};

const HOME = {
    view: "home" as const,
    resolvedVisibility: { developer: true, workType: true, unreadFilters: [] },
    resolvedScopeLock: "team" as const,
};

const urlWith = (patch: { repos?: string[]; developers?: string[] }) => {
    const filter = {
        ...defaultMetricFilter,
        scope: { level: "team" as const, ids: [] },
        what: patch.repos ? { repos: patch.repos } : {},
        who: patch.developers ? { developers: patch.developers } : {},
    };
    return `f=${encodeFilterParam(filter)}`;
};

beforeEach(async () => {
    scopeBarUrl.reset();
    optionsMock.value = {
        teams: [],
        team_names: {},
        repos: [REPO_NAMED, REPO_UNNAMED, "org/plain"],
        repo_names: { [REPO_NAMED]: "org/payments" },
        services: [],
        developers: [ANA, BO, CY],
        developer_names: { [ANA]: "Ana Silva", [BO]: "Bo Chen" },
        work_category: [],
    };
    const mod = await import("@/components/filters/useFilterOptions");
    vi.mocked(mod.useFilterOptions).mockImplementation(
        () => optionsMock.value as ReturnType<typeof mod.useFilterOptions>,
    );
});

describe("scope-bar repo picker labels", () => {
    it("shows the served name, Unresolved for an id with no name, and a plain name as is", async () => {
        const user = userEvent.setup();
        const { container } = render(<ScopeBarClient {...HOME} />);

        await user.click(screen.getByRole("button", { name: /repo/i }));

        expect(screen.getByLabelText("org/payments")).toBeTruthy();
        expect(screen.getByLabelText("Unresolved")).toBeTruthy();
        expect(screen.getByLabelText("org/plain")).toBeTruthy();
        expect(container.textContent).not.toContain(REPO_NAMED);
        expect(container.textContent).not.toContain(REPO_UNNAMED);
    });

    it("keeps the value written to the URL", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...HOME} />);

        await user.click(screen.getByRole("button", { name: /repo/i }));
        await user.click(screen.getByLabelText("org/payments"));

        await waitFor(() => expect(scopeBarUrl.lastFilter().what.repos).toEqual([REPO_NAMED]));
    });

    it("names the pill of a repository restored from the URL, never its id", () => {
        scopeBarUrl.reset(urlWith({ repos: [REPO_NAMED, REPO_UNNAMED] }));
        const { container } = render(<ScopeBarClient {...HOME} />);

        const bar = within(screen.getByTestId("scope-bar"));
        expect(bar.getAllByText("org/payments").length).toBeGreaterThan(0);
        expect(bar.getAllByText("Unresolved").length).toBeGreaterThan(0);
        expect(container.textContent).not.toContain(REPO_NAMED);
        expect(container.textContent).not.toContain(REPO_UNNAMED);
    });
});

describe("scope-bar developer picker labels", () => {
    it("shows the served name and Unresolved for a developer with no name, never the email", async () => {
        const user = userEvent.setup();
        const { container } = render(<ScopeBarClient {...PEOPLE} />);

        await user.click(screen.getByRole("button", { name: /developer/i }));

        expect(screen.getByLabelText("Ana Silva")).toBeTruthy();
        expect(screen.getByLabelText("Bo Chen")).toBeTruthy();
        expect(screen.getByLabelText("Unresolved")).toBeTruthy();
        expect(container.textContent).not.toContain(ANA);
        expect(container.textContent).not.toContain(CY);
    });

    it("keeps the email as the value written to the URL, and names its pill", async () => {
        const user = userEvent.setup();
        render(<ScopeBarClient {...PEOPLE} />);

        await user.click(screen.getByRole("button", { name: /developer/i }));
        await user.click(screen.getByLabelText("Ana Silva"));

        await waitFor(() => expect(scopeBarUrl.lastFilter().who.developers).toEqual([ANA]));
    });
});

describe("useFilterOptions", () => {
    it("keeps the served repo_names and developer_names", async () => {
        vi.mocked(apiClient.getJson).mockResolvedValue({
            repos: [REPO_NAMED],
            repo_names: { [REPO_NAMED]: "org/payments" },
            developers: [ANA],
            developer_names: { [ANA]: "Ana Silva" },
        });
        const actual = await vi.importActual<
            typeof import("@/components/filters/useFilterOptions")
        >("@/components/filters/useFilterOptions");

        const { result } = renderHook(() => actual.useFilterOptions());

        await waitFor(() => {
            expect(result.current.repo_names).toEqual({ [REPO_NAMED]: "org/payments" });
            expect(result.current.developer_names).toEqual({ [ANA]: "Ana Silva" });
        });
    });

    it("is empty maps when the payload carries none (before the pin roll)", async () => {
        vi.mocked(apiClient.getJson).mockResolvedValue({ repos: ["org/plain"] });
        const actual = await vi.importActual<
            typeof import("@/components/filters/useFilterOptions")
        >("@/components/filters/useFilterOptions");

        const { result } = renderHook(() => actual.useFilterOptions());

        await waitFor(() => expect(result.current.repos).toEqual(["org/plain"]));
        expect(result.current.repo_names).toEqual({});
        expect(result.current.developer_names).toEqual({});
    });
});
