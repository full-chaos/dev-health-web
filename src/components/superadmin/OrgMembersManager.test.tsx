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
const removeOrgMember = vi.fn();
const transferOrgOwnership = vi.fn();
const inviteOrgMember = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    addOrgMemberByEmail: (...a: unknown[]) => addOrgMemberByEmail(...a),
    changeOrgMemberRole: (...a: unknown[]) => changeOrgMemberRole(...a),
    removeOrgMember: (...a: unknown[]) => removeOrgMember(...a),
    transferOrgOwnership: (...a: unknown[]) => transferOrgOwnership(...a),
    inviteOrgMember: (...a: unknown[]) => inviteOrgMember(...a),
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
    removeOrgMember.mockReset();
    transferOrgOwnership.mockReset();
    inviteOrgMember.mockReset();
});

const owner = {
    ...members[0],
    id: "m0",
    user_id: "u0",
    user_name: "Grace Hopper",
    user_email: "grace@example.com",
    role: "owner",
};

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

    it("does not offer owner when adding, inviting or changing a role", () => {
        render(<OrgMembersManager orgId="o1" members={members} />);
        for (const label of ["Role", "Invite role", "Role for ada@example.com"]) {
            const options = Array.from(
                (screen.getByLabelText(label) as HTMLSelectElement).options,
            ).map((o) => o.value);
            expect(options).not.toContain("owner");
            expect(options).toEqual(expect.arrayContaining(["admin", "member", "viewer"]));
        }
    });

    it("shows the current owner role on an owner row", () => {
        render(<OrgMembersManager orgId="o1" members={[owner]} />);
        const select = screen.getByLabelText("Role for grace@example.com") as HTMLSelectElement;
        expect(select.value).toBe("owner");
    });

    it("sends an invite with the chosen role, then refreshes", async () => {
        inviteOrgMember.mockResolvedValue({ data: { id: "i1" } });
        const user = userEvent.setup();
        render(<OrgMembersManager orgId="o1" members={members} />);
        await user.type(screen.getByLabelText("Invite email"), "new@example.com");
        await user.selectOptions(screen.getByLabelText("Invite role"), "admin");
        await user.click(screen.getByRole("button", { name: "Send invite" }));
        await waitFor(() =>
            expect(inviteOrgMember).toHaveBeenCalledWith("o1", "new@example.com", "admin"),
        );
        await waitFor(() => expect(refresh).toHaveBeenCalled());
        expect(addOrgMemberByEmail).not.toHaveBeenCalled();
    });

    it("shows the sentence of a refused invite and does not refresh", async () => {
        inviteOrgMember.mockResolvedValue({
            error: "An invite for this email is already pending.",
        });
        const user = userEvent.setup();
        render(<OrgMembersManager orgId="o1" members={members} />);
        await user.type(screen.getByLabelText("Invite email"), "new@example.com");
        await user.click(screen.getByRole("button", { name: "Send invite" }));
        await waitFor(() =>
            expect(toastError).toHaveBeenCalledWith("An invite for this email is already pending."),
        );
        expect(refresh).not.toHaveBeenCalled();
    });

    it("removes a member only after the confirm step", async () => {
        removeOrgMember.mockResolvedValue({ data: undefined });
        const user = userEvent.setup();
        render(<OrgMembersManager orgId="o1" members={members} />);
        await user.click(screen.getByRole("button", { name: "Remove ada@example.com" }));
        expect(removeOrgMember).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Confirm remove ada@example.com" }));
        await waitFor(() => expect(removeOrgMember).toHaveBeenCalledWith("o1", "u1"));
        await waitFor(() => expect(refresh).toHaveBeenCalled());
    });

    it("cancels a remove without a call", async () => {
        const user = userEvent.setup();
        render(<OrgMembersManager orgId="o1" members={members} />);
        await user.click(screen.getByRole("button", { name: "Remove ada@example.com" }));
        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(removeOrgMember).not.toHaveBeenCalled();
        expect(
            screen.queryByRole("button", { name: "Confirm remove ada@example.com" }),
        ).not.toBeInTheDocument();
    });

    it("shows the server sentence of a refused remove and does not refresh", async () => {
        removeOrgMember.mockResolvedValue({
            error: "This is the last owner. Name another owner first.",
        });
        const user = userEvent.setup();
        render(<OrgMembersManager orgId="o1" members={[owner]} />);
        await user.click(screen.getByRole("button", { name: "Remove grace@example.com" }));
        await user.click(screen.getByRole("button", { name: "Confirm remove grace@example.com" }));
        await waitFor(() =>
            expect(toastError).toHaveBeenCalledWith(
                "This is the last owner. Name another owner first.",
            ),
        );
        expect(refresh).not.toHaveBeenCalled();
    });

    it("transfers ownership to a member only after the confirm step", async () => {
        transferOrgOwnership.mockResolvedValue({ data: undefined });
        const user = userEvent.setup();
        render(<OrgMembersManager orgId="o1" members={[owner, ...members]} />);
        await user.click(screen.getByRole("button", { name: "Make ada@example.com the owner" }));
        expect(transferOrgOwnership).not.toHaveBeenCalled();
        await user.click(
            screen.getByRole("button", { name: "Confirm owner change to ada@example.com" }),
        );
        await waitFor(() => expect(transferOrgOwnership).toHaveBeenCalledWith("o1", "u1"));
        await waitFor(() => expect(refresh).toHaveBeenCalled());
    });

    it("offers no ownership transfer to a member who already owns", () => {
        render(<OrgMembersManager orgId="o1" members={[owner]} />);
        expect(
            screen.queryByRole("button", { name: "Make grace@example.com the owner" }),
        ).not.toBeInTheDocument();
    });

    it("does not claim last-owner protection", () => {
        render(<OrgMembersManager orgId="o1" members={[owner]} />);
        expect(document.body.textContent ?? "").not.toMatch(/last owner|protected|cannot remove/i);
    });
});
