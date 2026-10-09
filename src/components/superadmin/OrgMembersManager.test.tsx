import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/utils";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    usePathname: () => "/superadmin/orgs/o1",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

const addOrgMemberByEmail = vi.fn();
const changeOrgMemberRole = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    addOrgMemberByEmail: (...a: unknown[]) => addOrgMemberByEmail(...a),
    changeOrgMemberRole: (...a: unknown[]) => changeOrgMemberRole(...a),
}));

import { OrgMembersManager } from "./OrgMembersManager";

const members = [
    {
        id: "m1",
        org_id: "o1",
        user_id: "u1",
        user_name: "Ada Lovelace",
        user_email: "ada@example.com",
        role: "member",
        invited_by_id: null,
        joined_at: null,
        created_at: "",
        updated_at: "",
    },
];

beforeEach(() => {
    refresh.mockReset();
    toastError.mockReset();
    addOrgMemberByEmail.mockReset();
    changeOrgMemberRole.mockReset();
});

describe("OrgMembersManager (CHAOS-8994)", () => {
    it("adds a member by email and role, then refreshes", async () => {
        addOrgMemberByEmail.mockResolvedValue({ data: { id: "m2" } });
        const user = userEvent.setup();
        render(<OrgMembersManager orgId="o1" members={members} />);
        await user.type(screen.getByLabelText("Member email"), "new@example.com");
        await user.selectOptions(screen.getByLabelText("Role"), "viewer");
        await user.click(screen.getByRole("button", { name: "Add member" }));
        await waitFor(() =>
            expect(addOrgMemberByEmail).toHaveBeenCalledWith("o1", "new@example.com", "viewer"),
        );
        await waitFor(() => expect(refresh).toHaveBeenCalled());
    });

    it("shows the real error for a duplicate member and does not refresh", async () => {
        addOrgMemberByEmail.mockResolvedValue({ error: "User is already a member" });
        const user = userEvent.setup();
        render(<OrgMembersManager orgId="o1" members={members} />);
        await user.type(screen.getByLabelText("Member email"), "ada@example.com");
        await user.click(screen.getByRole("button", { name: "Add member" }));
        await waitFor(() => expect(toastError).toHaveBeenCalledWith("User is already a member"));
        expect(refresh).not.toHaveBeenCalled();
    });

    it("changes a role from the list by name, not id", async () => {
        changeOrgMemberRole.mockResolvedValue({ data: { id: "m1" } });
        const user = userEvent.setup();
        render(<OrgMembersManager orgId="o1" members={members} />);
        expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText("Role for ada@example.com"), "admin");
        await waitFor(() => expect(changeOrgMemberRole).toHaveBeenCalledWith("o1", "u1", "admin"));
    });
});
