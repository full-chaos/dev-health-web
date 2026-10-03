import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import type { User } from "@/lib/admin/types";
import {
    getPendingTeamChanges,
    listCredentials,
    listIdentities,
    listSyncConfigs,
    listTeams,
    listUsers,
} from "@/lib/admin/server";
import AdminDashboardPage from "./page";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

vi.mock("@/lib/auth", () => ({
    auth: vi.fn(async () => ({ user: { name: "Ada Admin", email: "admin@test.com" } })),
}));

vi.mock("@/lib/admin/server", () => ({
    listUsers: vi.fn(),
    listTeams: vi.fn(),
    listIdentities: vi.fn(),
    listCredentials: vi.fn(),
    listSyncConfigs: vi.fn(),
    getPendingTeamChanges: vi.fn(),
}));

describe("AdminDashboardPage", () => {
    beforeEach(() => {
        vi.mocked(listUsers).mockResolvedValue({ data: [] });
        vi.mocked(listTeams).mockResolvedValue({ data: [] });
        vi.mocked(listIdentities).mockResolvedValue({ data: [] });
        vi.mocked(listCredentials).mockResolvedValue({ data: [] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });
        vi.mocked(getPendingTeamChanges).mockResolvedValue({
            data: { changes: [], total: 0 },
        });
    });

    it("renders operational signals without the partial banner on the happy path", async () => {
        render(await AdminDashboardPage());

        expect(screen.getByRole("heading", { level: 1, name: "Organization" })).toBeInTheDocument();
        expect(screen.getByText("Organization roster")).toBeInTheDocument();
        expect(screen.getByText("Setup progress")).toBeInTheDocument();
        expect(screen.queryByText(/Some admin signals could not load/)).not.toBeInTheDocument();
    });

    it("degrades to the partial-signals banner when a list action returns a non-array payload", async () => {
        // Reproduces the E2E mock envelope that 500'd /org/admin with
        // `users.filter is not a function` — an out-of-contract payload, hence
        // the double assertion.
        vi.mocked(listUsers).mockResolvedValue({
            data: { items: [], total: 1 } as unknown as User[],
        });

        render(await AdminDashboardPage());

        expect(screen.getByRole("heading", { level: 1, name: "Organization" })).toBeInTheDocument();
        expect(screen.getByText(/Some admin signals could not load/)).toBeInTheDocument();
    });

    it("shows the partial-signals banner when an action reports an error", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ error: "backend unavailable" });

        render(await AdminDashboardPage());

        expect(screen.getByText(/Some admin signals could not load/)).toBeInTheDocument();
    });

    it("has no greeting: the header carries neither the name nor the e-mail address (AD-2)", async () => {
        const { container } = render(await AdminDashboardPage());

        expect(container.textContent).not.toMatch(/Welcome back/);
        expect(container.textContent).not.toContain("Ada Admin");
        expect(container.textContent).not.toContain("admin@test.com");
        expect(
            screen.getByText("System configuration and management for this organization."),
        ).toBeInTheDocument();
    });

    it("shows the four signals as one joined strip with their links, and the Attention pill only above zero", async () => {
        vi.mocked(listSyncConfigs).mockResolvedValue({
            data: [{ is_active: true, last_sync_success: false }] as unknown as Awaited<
                ReturnType<typeof listSyncConfigs>
            >["data"],
        });
        render(await AdminDashboardPage());

        const strip = screen.getByTestId("admin-signal-strip");
        expect(strip.querySelectorAll("section")).toHaveLength(4);
        expect(screen.getByRole("link", { name: "Review sync health" })).toHaveAttribute(
            "href",
            "/org/admin/sync",
        );
        expect(screen.getAllByText("Attention")).toHaveLength(1);
    });

    it("has no Attention pill when nothing needs attention", async () => {
        render(await AdminDashboardPage());

        expect(screen.queryByText("Attention")).toBeNull();
    });

    it("marks each setup line, with the same sentence as before", async () => {
        render(await AdminDashboardPage());

        const lines = screen.getByTestId("setup-checklist").querySelectorAll("li");
        expect(lines).toHaveLength(3);
        expect(lines[0]).toHaveTextContent("No integration credentials are configured yet.");
        expect(lines[2]).toHaveTextContent(
            "Add teams so ownership and identity mapping can be reviewed.",
        );
    });

    it("shows the partial-signals notice as a warning notice", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ error: "backend unavailable" });
        render(await AdminDashboardPage());

        expect(
            screen.getByText(/Some admin signals could not load/).closest("[data-notice-variant]"),
        ).toHaveAttribute("data-notice-variant", "warn");
    });
});
