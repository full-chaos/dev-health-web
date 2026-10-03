import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, within } from "@/test/utils";

import { UserTable } from "./UserTable";
import type { User } from "@/lib/admin/types";

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: ReactNode;
        href: string;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

function makeUser(overrides: Partial<User>): User {
    return {
        id: "user-1",
        email: "alice@example.com",
        username: "alice",
        full_name: "Alice Example",
        avatar_url: null,
        auth_provider: "local",
        is_active: true,
        is_verified: true,
        is_superuser: false,
        role: "member",
        last_login_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

const users: User[] = [
    makeUser({ id: "user-1", email: "alice@example.com", full_name: "Alice Example" }),
    makeUser({
        id: "user-2",
        email: "bob@example.com",
        username: "octobob",
        full_name: "Bob Invited",
        auth_provider: "github",
        is_verified: false,
    }),
];

describe("UserTable", () => {
    it("filters rows by text typed into the table search", async () => {
        const user = userEvent.setup();
        render(<UserTable users={users} />);

        await user.type(screen.getByPlaceholderText("Search users"), "github");

        expect(screen.queryByRole("link", { name: "Alice Example" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Bob Invited" })).toBeInTheDocument();
    });

    it("shows a search-specific empty state when no user matches", async () => {
        const user = userEvent.setup();
        render(<UserTable users={users} />);

        await user.type(screen.getByPlaceholderText("Search users"), "not-present");

        expect(screen.getByText("No users match your search.")).toBeInTheDocument();
        expect(screen.queryByText("No users found.")).not.toBeInTheDocument();
    });

    it("keeps the base empty state when no users exist", () => {
        render(<UserTable users={[]} />);

        expect(screen.getByText("No users found.")).toBeInTheDocument();
        expect(screen.queryByText("No users match your search.")).not.toBeInTheDocument();
    });

    it("is a section card with the served count, and 'n of N users' while a search narrows it", async () => {
        const user = userEvent.setup();
        render(<UserTable users={users} />);

        expect(screen.getByRole("heading", { level: 2, name: "Users" })).toBeInTheDocument();
        expect(screen.getByText("2 users")).toBeInTheDocument();

        await user.type(screen.getByPlaceholderText("Search users"), "github");

        expect(screen.getByText("1 of 2 users")).toBeInTheDocument();
    });

    it("says Active, Pending or Inactive with an icon; Pending is a user whose e-mail is not verified", () => {
        render(
            <UserTable
                users={[
                    ...users,
                    makeUser({ id: "user-3", full_name: "Carol Off", is_active: false }),
                ]}
            />,
        );

        const rows = screen.getAllByRole("row").slice(1);
        const pills = rows.map((row) => within(row).getByText(/^(Active|Pending|Inactive)$/u));
        expect(pills.map((p) => p.textContent)).toEqual(["Active", "Pending", "Inactive"]);
        for (const pill of pills) expect(pill.querySelector("svg")).not.toBeNull();
        expect(screen.queryByText("pending")).toBeNull();
        expect(screen.queryByText("Invited")).toBeNull();
    });

    it("shows the auth provider as a neutral outlined pill", () => {
        render(<UserTable users={[users[1]]} />);

        const pill = screen.getByText("github");
        expect(pill.className).toContain("border-(--card-stroke)");
        expect(pill.className).not.toContain("bg-(--accent)");
    });
});
