import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

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
});
