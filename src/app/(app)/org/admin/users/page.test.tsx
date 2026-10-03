import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

vi.mock("next/navigation", () => ({
    usePathname: () => "/org/admin/users",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn() }),
}));

const listUsers = vi.fn();
vi.mock("@/lib/admin/server", () => ({ listUsers: () => listUsers() }));

import UsersPage from "./page";

beforeEach(() => listUsers.mockReset());

describe("Users page (CHAOS-8235)", () => {
    it("has the h1 Organization and Add User as the shared primary button with the icon first", async () => {
        listUsers.mockResolvedValue({ data: [] });
        render(await UsersPage());

        expect(screen.getByRole("heading", { level: 1, name: "Organization" })).toBeInTheDocument();
        const add = within(screen.getByTestId("page-header")).getByRole("link", {
            name: "Add User",
        });
        expect(add).toHaveAttribute("href", "/org/admin/users/new");
        expect(add.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(add.className).toContain("bg-(--action)");
    });

    it("says one plain sentence with Retry on an error and keeps the header, not the backend text", async () => {
        listUsers.mockResolvedValue({ error: "GET /api/v1/admin/users 502 upstream" });
        const { container } = render(await UsersPage());

        expect(screen.getByText(/Users could not be loaded\. Retry/u)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Add User" })).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
        expect(container.textContent).not.toContain("/api/v1");
        expect(screen.queryByRole("table")).toBeNull();
    });
});
