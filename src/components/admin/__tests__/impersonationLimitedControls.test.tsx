import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
    value: {
        data: { user: { id: "admin-1", is_superuser: true, is_impersonating: true } },
        update: vi.fn(),
    } as unknown,
}));
vi.mock("next-auth/react", () => ({ useSession: () => session.value }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/org/admin/settings",
}));
vi.mock("@/lib/admin/server", () => ({
    deleteCurrentOrg: vi.fn(),
    dryRunDeleteCurrentOrg: vi.fn(),
    updateOrgProfile: vi.fn(),
    deleteUser: vi.fn(),
    startImpersonation: vi.fn(),
}));

import { AdminNavProvider } from "@/components/admin/AdminTabs";
import { HideWhileImpersonationLimited } from "@/components/admin/HideWhileImpersonationLimited";
import { DangerZone } from "@/components/admin/settings/DangerZone";
import { GeneralSettings } from "@/components/admin/settings/GeneralSettings";
import { ImpersonateUserButton } from "@/components/admin/users/ImpersonateUserButton";
import { UserTable } from "@/components/superadmin/UserTable";
import { DeleteUserButton } from "@/app/(app)/org/admin/users/[id]/DeleteUserButton";
import type { User } from "@/lib/admin/types";

const target = {
    id: "u-2",
    email: "member@example.test",
    role: "member",
    is_superuser: false,
    is_active: true,
} as unknown as User;

function within(limited: boolean, ui: ReactNode) {
    return render(
        <AdminNavProvider isPlatformAdmin={!limited} impersonationLimited={limited}>
            {ui}
        </AdminNavProvider>,
    );
}

beforeEach(() => {
    session.value = {
        data: { user: { id: "admin-1", is_superuser: true, is_impersonating: true } },
        update: vi.fn(),
    };
});

describe("controls a limited session does not see", () => {
    it.each([
        [
            "the wrapper",
            <HideWhileImpersonationLimited key="w">
                <a href="/x">Add User</a>
            </HideWhileImpersonationLimited>,
            /Add User/,
        ],
        ["DangerZone (org.delete)", <DangerZone key="d" orgName="Acme" />, /Delete Organization/],
        [
            "DeleteUserButton (members.manage)",
            <DeleteUserButton key="u" userId="u-2" userEmail="m@example.test" />,
            /Delete User/,
        ],
        [
            "ImpersonateUserButton (no nesting)",
            <ImpersonateUserButton key="i" user={target} />,
            /Impersonate User/,
        ],
        [
            "UserTable Impersonate (no nesting)",
            <UserTable key="t" users={[target]} />,
            /^Impersonate$/,
        ],
    ] as const)("%s", (_, ui, label) => {
        const shown = within(false, ui);
        expect(screen.queryAllByText(label).length).toBeGreaterThan(0);
        shown.unmount();
        within(true, ui);
        expect(screen.queryAllByText(label)).toHaveLength(0);
    });

    it("GeneralSettings (org.write) hides the save button and keeps the read-only fields", () => {
        const org = { id: "o", slug: "acme", name: "Acme", description: null } as never;
        const shown = within(false, <GeneralSettings org={org} />);
        expect(screen.getByRole("button", { name: "Save Changes" })).toBeTruthy();
        shown.unmount();
        within(true, <GeneralSettings org={org} />);
        expect(screen.queryByRole("button", { name: "Save Changes" })).toBeNull();
        expect(screen.getByDisplayValue("Acme")).toBeTruthy();
    });

    it("C10 a client session that says not impersonating does not bring the controls back", () => {
        session.value = {
            data: { user: { id: "admin-1", is_superuser: true, is_impersonating: false } },
            update: vi.fn(),
        };
        within(true, <ImpersonateUserButton user={target} />);
        expect(screen.queryByText(/Impersonate User/)).toBeNull();
    });

    it("C3/C4 with no limit the controls render as today (default context)", () => {
        render(<ImpersonateUserButton user={target} />);
        expect(screen.getByText(/Impersonate User/)).toBeTruthy();
    });
});
