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
    auth: vi.fn(async () => ({ user: { email: "admin@test.com" } })),
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

        expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
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

        expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
        expect(screen.getByText(/Some admin signals could not load/)).toBeInTheDocument();
    });

    it("shows the partial-signals banner when an action reports an error", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ error: "backend unavailable" });

        render(await AdminDashboardPage());

        expect(screen.getByText(/Some admin signals could not load/)).toBeInTheDocument();
    });
});
