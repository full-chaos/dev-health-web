import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/utils";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    usePathname: () => "/superadmin/service-accounts/new",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push, refresh }),
}));

const ORG_A = "00000000-0000-4000-8000-0000000000b1";
const ORG_B = "00000000-0000-4000-8000-0000000000b2";
const createServiceAccount = vi.fn();
const listOrganizations = vi.fn();
const listOrgMembers = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    createServiceAccount: (d: unknown) => createServiceAccount(d),
    listOrganizations: () => listOrganizations(),
    listOrgMembers: (id: string) => listOrgMembers(id),
}));

import NewServiceAccountPage from "./page";

async function fill(name: string, pick = false) {
    const user = userEvent.setup();
    render(<NewServiceAccountPage />);
    if (name) await user.type(screen.getByLabelText(/^name/i), name);
    if (pick) {
        await user.selectOptions(await screen.findByLabelText(/^organization/i), ORG_A);
        await user.selectOptions(
            await screen
                .findByRole("option", { name: "Owner One" })
                .then(() => screen.getByLabelText(/^owner/i)),
            "u-1",
        );
    }
    await user.click(screen.getByRole("button", { name: /create service account/i }));
}

beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    createServiceAccount.mockReset();
    listOrganizations.mockReset();
    listOrgMembers.mockReset();
    listOrganizations.mockResolvedValue({
        data: [
            { id: ORG_A, name: "Org A", is_active: true },
            { id: ORG_B, name: "Org B", is_active: true },
        ],
    });
    listOrgMembers.mockImplementation(async (id: string) => ({
        data:
            id === ORG_A
                ? [{ user_id: "u-1", user_name: "Owner One", user_email: "one@example.invalid" }]
                : [{ user_id: "u-2", user_name: null, user_email: "two@example.invalid" }],
    }));
});

describe("Create service account page (CHAOS-8966)", () => {
    it("refuses an empty name without calling the action", async () => {
        await fill("", true);
        expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
        expect(createServiceAccount).not.toHaveBeenCalled();
    });

    it("refuses an invalid name without calling the action", async () => {
        await fill("Bad Name", true);
        expect(await screen.findByText(/lowercase letters/i)).toBeInTheDocument();
        expect(createServiceAccount).not.toHaveBeenCalled();
    });

    it("shows the made address and the operator line on success, with no URL change", async () => {
        createServiceAccount.mockResolvedValue({
            data: { service_account_id: "sa-9", name: "ci" },
        });
        await fill("ci", true);
        expect(await screen.findByText("sa-9")).toBeInTheDocument();
        expect(screen.getByText(/issued by an operator/i)).toBeInTheDocument();
        expect(createServiceAccount).toHaveBeenCalledWith({
            name: "ci",
            organization_id: ORG_A,
            owner_principal_id: "u-1",
        });
        expect(push).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalled();
    });

    it("shows the returned sentence on a failure and keeps the form", async () => {
        createServiceAccount.mockResolvedValue({
            error: "A service account with this name already exists.",
        });
        await fill("ci", true);
        expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    });

    it("shows the owner_invalid sentence in the failure notice and creates nothing", async () => {
        createServiceAccount.mockResolvedValue({ error: "Owner must be an active user" });
        await fill("ci", true);
        expect(await screen.findByText("Owner must be an active user")).toBeInTheDocument();
        expect(screen.queryByText("ID")).toBeNull();
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    });

    it("shows the owner_not_member sentence in the failure notice and creates nothing", async () => {
        createServiceAccount.mockResolvedValue({
            error: "Owner is not a member of the organization",
        });
        await fill("ci", true);
        expect(
            await screen.findByText("Owner is not a member of the organization"),
        ).toBeInTheDocument();
        expect(screen.queryByText("ID")).toBeNull();
    });

    it("shows the generic sentence when the action throws", async () => {
        createServiceAccount.mockRejectedValue(new Error("pgx boom"));
        await fill("ci", true);
        await waitFor(() => expect(screen.getByText(ACTION_FAILED_MESSAGE)).toBeInTheDocument());
        expect(screen.queryByText(/pgx/)).toBeNull();
    });

    it("keeps submit disabled and names the missing organization and owner on blur", async () => {
        const user = userEvent.setup();
        render(<NewServiceAccountPage />);
        await user.type(screen.getByLabelText(/^name/i), "ci");
        expect(screen.getByRole("button", { name: /create service account/i })).toBeDisabled();
        await user.click(await screen.findByLabelText(/^organization/i));
        await user.click(screen.getByLabelText(/^owner/i));
        await user.click(screen.getByLabelText(/^name/i));
        expect(await screen.findByText("Choose an organization.")).toBeInTheDocument();
        expect(screen.getByText("Choose an owner.")).toBeInTheDocument();
        expect(createServiceAccount).not.toHaveBeenCalled();
    });

    it("offers only active organizations", async () => {
        listOrganizations.mockResolvedValue({
            data: [
                { id: ORG_A, name: "Org A", is_active: true },
                { id: ORG_B, name: "Org B", is_active: false },
            ],
        });
        render(<NewServiceAccountPage />);
        expect(await screen.findByRole("option", { name: "Org A" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Org B" })).toBeNull();
    });

    it("lists the members of the picked organization and resets the owner on a change", async () => {
        const user = userEvent.setup();
        render(<NewServiceAccountPage />);
        await user.selectOptions(await screen.findByLabelText(/^organization/i), ORG_A);
        expect(await screen.findByRole("option", { name: "Owner One" })).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText(/^owner/i), "u-1");
        await user.selectOptions(screen.getByLabelText(/^organization/i), ORG_B);
        expect(
            await screen.findByRole("option", { name: "two@example.invalid" }),
        ).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Owner One" })).toBeNull();
        expect(screen.getByLabelText(/^owner/i)).toHaveValue("");
        expect(listOrgMembers).toHaveBeenCalledWith(ORG_B);
    });
});
