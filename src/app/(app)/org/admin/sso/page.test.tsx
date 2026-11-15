/** SsoProvidersPage tests (CHAOS-13638): the page shows what the go-api provider routes answer. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, userEvent, waitFor, within } from "@/test/utils";
import type { SsoProvider } from "@/lib/admin/types";

const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
    logger: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockActivate = vi.fn();
const mockDeactivate = vi.fn();

vi.mock("@/lib/admin/server", () => ({
    listSsoProviders: (...args: unknown[]) => mockList(...args),
    createSsoProvider: (...args: unknown[]) => mockCreate(...args),
    updateSsoProvider: (...args: unknown[]) => mockUpdate(...args),
    deleteSsoProvider: (...args: unknown[]) => mockDelete(...args),
    activateSsoProvider: (...args: unknown[]) => mockActivate(...args),
    deactivateSsoProvider: (...args: unknown[]) => mockDeactivate(...args),
}));

import SsoProvidersPage from "./page";

const RAW_SECRET = "RAW-CLIENT-SECRET-must-never-render";

function makeProvider(overrides: Partial<SsoProvider> = {}): SsoProvider {
    return {
        id: "p-1",
        org_id: "org-1",
        name: "Okta",
        protocol: "oidc",
        status: "active",
        is_default: false,
        allow_idp_initiated: false,
        auto_provision_users: true,
        default_role: "member",
        config: { client_id: "cid-1", client_secret: "********", issuer: "https://idp.test" },
        allowed_domains: null,
        last_metadata_sync_at: null,
        last_login_at: null,
        last_error: null,
        last_error_at: null,
        created_at: "2026-11-01T00:00:00Z",
        updated_at: "2026-11-01T00:00:00Z",
        ...overrides,
    };
}

const listOf = (items: SsoProvider[]) => ({
    data: { items, total: items.length, limit: 50, offset: 0 },
});

describe("SsoProvidersPage", () => {
    beforeEach(() => {
        for (const mock of [mockList, mockCreate, mockUpdate, mockDelete, mockActivate]) {
            mock.mockReset();
        }
        mockDeactivate.mockReset();
        logError.mockReset();
    });
    afterEach(cleanup);

    it("lists providers and never renders a secret, masked or raw", async () => {
        mockList.mockResolvedValue(
            listOf([
                makeProvider({
                    config: { client_id: "cid-1", client_secret: RAW_SECRET, issuer: "https://i" },
                }),
            ]),
        );
        render(<SsoProvidersPage />);
        expect(await screen.findByText("Okta")).toBeTruthy();
        expect(document.body.textContent).not.toContain(RAW_SECRET);
        expect(document.body.textContent).not.toContain("********");
    });

    it("shows the empty state with an Add button", async () => {
        mockList.mockResolvedValue(listOf([]));
        render(<SsoProvidersPage />);
        expect(await screen.findByText(/No SSO providers configured/u)).toBeTruthy();
        expect(screen.getByRole("button", { name: "Add SSO provider" })).toBeTruthy();
    });

    it("shows the served 402 sentence as a plan notice, not a load failure", async () => {
        mockList.mockResolvedValue({
            error: "This feature requires the enterprise plan (current plan: community).",
            status: 402,
        });
        render(<SsoProvidersPage />);
        expect(await screen.findByText(/This feature requires the enterprise plan/u)).toBeTruthy();
        expect(screen.queryByText(/could not be loaded/u)).toBeNull();
        expect(screen.queryByRole("button", { name: "Add SSO provider" })).toBeNull();
    });

    it("shows the unavailable sentence and Retry on a 503", async () => {
        mockList.mockResolvedValue({ error: "Could not be read.", status: 503 });
        render(<SsoProvidersPage />);
        expect(await screen.findByText(/SSO provider service is unavailable/u)).toBeTruthy();
        mockList.mockResolvedValue(listOf([makeProvider()]));
        await userEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(await screen.findByText("Okta")).toBeTruthy();
    });

    it("shows the generic load failure on a 500 and never says not configured", async () => {
        mockList.mockResolvedValue({ error: "Could not be read.", status: 500 });
        render(<SsoProvidersPage />);
        expect(await screen.findByText(/could not be loaded/u)).toBeTruthy();
        expect(document.body.textContent).not.toMatch(/not configured/iu);
    });

    it("shows only a notice, with no write buttons, when the list answers 403", async () => {
        mockList.mockResolvedValue({ error: "Could not be read.", status: 403 });
        render(<SsoProvidersPage />);
        expect(
            await screen.findByText(/Only owners and admins can change SSO providers/u),
        ).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Add SSO provider" })).toBeNull();
    });

    it("hides every write button after a write answers 403, keeping the list", async () => {
        mockList.mockResolvedValue(listOf([makeProvider()]));
        mockDeactivate.mockResolvedValue({
            error: "The change was not saved. Try again.",
            status: 403,
        });
        render(<SsoProvidersPage />);
        await screen.findByText("Okta");
        await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
        expect(
            await screen.findByText(/Only owners and admins can change SSO providers/u),
        ).toBeTruthy();
        expect(screen.getByText("Okta")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Add SSO provider" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    });

    it("creates an OIDC provider with the exact body", async () => {
        mockList.mockResolvedValue(listOf([]));
        mockCreate.mockResolvedValue({ data: makeProvider() });
        render(<SsoProvidersPage />);
        await userEvent.click(await screen.findByRole("button", { name: "Add SSO provider" }));
        await userEvent.type(screen.getByLabelText("Name"), "Okta");
        await userEvent.type(screen.getByLabelText("Client ID"), "cid");
        await userEvent.type(screen.getByLabelText("Client secret"), "s3cret");
        await userEvent.type(screen.getByLabelText("Issuer"), "https://idp.test");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
        expect(mockCreate.mock.calls[0][0]).toEqual({
            name: "Okta",
            protocol: "oidc",
            oidc_config: { client_id: "cid", client_secret: "s3cret", issuer: "https://idp.test" },
            is_default: false,
            allow_idp_initiated: false,
            auto_provision_users: true,
        });
    });

    it("creates a SAML provider with the exact body", async () => {
        mockList.mockResolvedValue(listOf([]));
        mockCreate.mockResolvedValue({ data: makeProvider({ protocol: "saml" }) });
        render(<SsoProvidersPage />);
        await userEvent.click(await screen.findByRole("button", { name: "Add SSO provider" }));
        await userEvent.type(screen.getByLabelText("Name"), "Corp");
        await userEvent.selectOptions(screen.getByLabelText("Protocol"), "saml");
        await userEvent.type(screen.getByLabelText("Entity ID"), "ent");
        await userEvent.type(screen.getByLabelText("SSO URL"), "https://sso.test/s");
        await userEvent.type(screen.getByLabelText("Certificate"), "CERT");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
        expect(mockCreate.mock.calls[0][0]).toMatchObject({
            name: "Corp",
            protocol: "saml",
            saml_config: { entity_id: "ent", sso_url: "https://sso.test/s", certificate: "CERT" },
        });
        expect(mockCreate.mock.calls[0][0]).not.toHaveProperty("oidc_config");
    });

    it("shows the served text of a 422 in the form", async () => {
        mockList.mockResolvedValue(listOf([]));
        mockCreate.mockResolvedValue({ error: "issuer: Field required", status: 422 });
        render(<SsoProvidersPage />);
        await userEvent.click(await screen.findByRole("button", { name: "Add SSO provider" }));
        await userEvent.type(screen.getByLabelText("Name"), "Okta");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByText("issuer: Field required")).toBeTruthy();
    });

    it("edits without a new secret: the PATCH body has no client_secret", async () => {
        mockList.mockResolvedValue(listOf([makeProvider()]));
        mockUpdate.mockResolvedValue({ data: makeProvider({ name: "Okta 2" }) });
        render(<SsoProvidersPage />);
        await screen.findByText("Okta");
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        const name = screen.getByLabelText("Name");
        await userEvent.clear(name);
        await userEvent.type(name, "Okta 2");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
        expect(mockUpdate.mock.calls[0][0]).toBe("p-1");
        const body = mockUpdate.mock.calls[0][1];
        expect(body.name).toBe("Okta 2");
        expect(JSON.stringify(body)).not.toContain("client_secret");
    });

    it("sends a new client secret only when one is typed", async () => {
        mockList.mockResolvedValue(listOf([makeProvider()]));
        mockUpdate.mockResolvedValue({ data: makeProvider() });
        render(<SsoProvidersPage />);
        await screen.findByText("Okta");
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await userEvent.type(screen.getByLabelText("Client secret"), "rotated");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
        expect(mockUpdate.mock.calls[0][1].oidc_config).toMatchObject({
            client_id: "cid-1",
            issuer: "https://idp.test",
            client_secret: "rotated",
        });
    });

    it("deletes only after the confirm, then reloads", async () => {
        mockList.mockResolvedValue(listOf([makeProvider()]));
        mockDelete.mockResolvedValue({ data: undefined });
        render(<SsoProvidersPage />);
        await screen.findByText("Okta");
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(mockDelete).not.toHaveBeenCalled();
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("p-1"));
        await waitFor(() => expect(mockList.mock.calls.length).toBeGreaterThan(1));
    });

    it("activates an inactive provider and deactivates an active one", async () => {
        mockList.mockResolvedValue(listOf([makeProvider({ status: "inactive" })]));
        mockActivate.mockResolvedValue({ data: makeProvider() });
        render(<SsoProvidersPage />);
        await screen.findByText("Okta");
        await userEvent.click(screen.getByRole("button", { name: "Activate" }));
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Activate" }));
        await waitFor(() => expect(mockActivate).toHaveBeenCalledWith("p-1"));
        expect(mockDeactivate).not.toHaveBeenCalled();
    });

    it("shows the same write-refused notice for an impersonation 403 (no special copy)", async () => {
        mockList.mockResolvedValue(listOf([makeProvider()]));
        mockDeactivate.mockResolvedValue({
            error: "Not allowed in an impersonation session",
            status: 403,
        });
        render(<SsoProvidersPage />);
        await screen.findByText("Okta");
        await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));
        const dialog = await screen.findByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: "Deactivate" }));
        await waitFor(() => expect(mockDeactivate).toHaveBeenCalledWith("p-1"));
        expect(
            await screen.findByText(/Only owners and admins can change SSO providers/u),
        ).toBeTruthy();
    });
});
