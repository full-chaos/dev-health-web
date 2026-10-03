import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

vi.mock("next/navigation", () => ({
    usePathname: () => "/org/admin/teams",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/admin/teams/PendingChangesPanel", () => ({
    PendingChangesPanel: () => null,
}));

const listTeams = vi.fn();
const getPendingTeamChanges = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    listTeams: () => listTeams(),
    getPendingTeamChanges: () => getPendingTeamChanges(),
    discoverTeams: vi.fn(),
    importTeams: vi.fn(),
}));

import TeamsPage from "./page";

beforeEach(() => {
    listTeams.mockReset();
    getPendingTeamChanges.mockReset();
    getPendingTeamChanges.mockResolvedValue({ data: { changes: [], total: 0 } });
});

describe("Teams page (CHAOS-8236)", () => {
    it("has the h1 Organization, Import Teams and Add Team as the shared primary button with the icon first", async () => {
        listTeams.mockResolvedValue({ data: [] });
        render(await TeamsPage());

        expect(screen.getByRole("heading", { level: 1, name: "Organization" })).toBeInTheDocument();
        const header = within(screen.getByTestId("page-header"));
        expect(header.getByRole("button", { name: "Import Teams" })).toBeInTheDocument();
        const add = header.getByRole("link", { name: "Add Team" });
        expect(add.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(add.className).toContain("bg-(--action)");
    });

    it("shows the pending-changes count as a pill with an icon, only above zero", async () => {
        listTeams.mockResolvedValue({ data: [] });
        getPendingTeamChanges.mockResolvedValue({ data: { changes: [], total: 3 } });
        render(await TeamsPage());

        const pill = screen.getByText("3 pending");
        expect(pill.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    });

    it("says one plain sentence with Retry on an error, not the backend text, and keeps the actions", async () => {
        listTeams.mockResolvedValue({ error: "GET /api/v1/admin/teams 502 upstream" });
        const { container } = render(await TeamsPage());

        expect(screen.getByText(/Teams could not be loaded\. Retry/u)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Add Team" })).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
        expect(screen.queryByRole("table")).toBeNull();
    });
});
