import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

vi.mock("next/navigation", () => ({
    usePathname: () => "/org/admin/identities",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn() }),
}));

const listIdentities = vi.fn();
vi.mock("@/lib/admin/server", () => ({ listIdentities: () => listIdentities() }));

import IdentitiesPage from "./page";

beforeEach(() => listIdentities.mockReset());

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
});
