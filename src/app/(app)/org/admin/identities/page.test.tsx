import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

vi.mock("next/navigation", () => ({
    usePathname: () => "/org/admin/identities",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn() }),
}));

const listIdentities = vi.fn();
const listTeams = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    listIdentities: () => listIdentities(),
    listTeams: () => listTeams(),
}));

import IdentitiesPage from "./page";

beforeEach(() => {
    listIdentities.mockReset();
    listTeams.mockReset();
    listTeams.mockResolvedValue({ data: [] });
});

describe("Identities page (CHAOS-8237)", () => {
    it("has the h1 Organization and Add Identity as the shared primary button with the icon first", async () => {
        listIdentities.mockResolvedValue({ data: [] });
        render(await IdentitiesPage());

        expect(screen.getByRole("heading", { level: 1, name: "Organization" })).toBeInTheDocument();
        const add = within(screen.getByTestId("page-header")).getByRole("link", {
            name: "Add Identity",
        });
        expect(add).toHaveAttribute("href", "/org/admin/identities/new");
        expect(add.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(add.className).toContain("bg-(--action)");
        expect(screen.getByText("No identities found.")).toBeInTheDocument();
    });

    it("says one plain sentence with Retry on an error, not the backend text, and keeps the header", async () => {
        listIdentities.mockResolvedValue({ error: "GET /api/v1/admin/identities 502 upstream" });
        const { container } = render(await IdentitiesPage());

        expect(screen.getByText(/Identities could not be loaded\. Retry/u)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Add Identity" })).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
        expect(screen.queryByRole("table")).toBeNull();
    });

    const ident = {
        canonical_id: "fixture-identity-1",
        display_name: "Fixture Identity 1",
        email: null,
        team_ids: ["7c9e6679-7425-40de-944b-e07fc1f90ae7"],
        provider_identities: {},
    };

    it("names the team from the team list", async () => {
        listIdentities.mockResolvedValue({ data: [ident] });
        listTeams.mockResolvedValue({
            data: [{ team_id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", name: "Fixture Team 1" }],
        });
        render(await IdentitiesPage());

        expect(screen.getByRole("link", { name: "Fixture Team 1" })).toBeInTheDocument();
    });

    it("degrades to short id + Unresolved, with no extra error, when the team list failed", async () => {
        listIdentities.mockResolvedValue({ data: [ident] });
        listTeams.mockResolvedValue({ error: "GET /api/v1/admin/teams 502" });
        const { container } = render(await IdentitiesPage());

        expect(screen.getByText("Unresolved")).toBeInTheDocument();
        expect(screen.queryByText(/could not be loaded/u)).toBeNull();
        expect(container.textContent).not.toContain("502");
        expect(screen.getByRole("table")).toBeInTheDocument();
    });
});
