import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";
import type { CustomerPushToken } from "@/lib/admin/types";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: mockRefresh }),
}));

const mockRotateCustomerPushToken = vi.fn();
const mockRevokeCustomerPushToken = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    rotateCustomerPushToken: (...args: unknown[]) => mockRotateCustomerPushToken(...args),
    revokeCustomerPushToken: (...args: unknown[]) => mockRevokeCustomerPushToken(...args),
}));

import { CustomerPushTokenList } from "./CustomerPushTokenList";

const activeToken: CustomerPushToken = {
    id: "cpt-1",
    org_id: "org-1",
    name: "CI runner",
    source_id: "cps-1",
    token_prefix: "fcpush_ab12",
    scopes: ["schema:read", "ingest:write", "ingest:status"],
    last_used_at: "2026-06-26T00:00:00.000Z",
    expires_at: null,
    revoked_at: null,
    created_at: "2026-06-25T00:00:00.000Z",
};

describe("CustomerPushTokenList", () => {
    afterEach(() => {
        mockRotateCustomerPushToken.mockReset();
        mockRevokeCustomerPushToken.mockReset();
    });

    it("shows the empty state with a CTA to create a credential", () => {
        render(<CustomerPushTokenList tokens={[]} newTokenHref="/new" examplesHref="/examples" />);
        expect(screen.getByText("No credentials yet for this source")).toBeInTheDocument();
    });

    it("renders the token_prefix for identification, but never the plaintext secret — the list response has no `token` field to leak", () => {
        render(
            <CustomerPushTokenList
                tokens={[activeToken]}
                newTokenHref="/new"
                examplesHref="/examples"
            />,
        );
        expect(screen.getByText("CI runner")).toBeInTheDocument();
        expect(screen.getByText("Active")).toBeInTheDocument();
        expect(screen.getByText(`${activeToken.token_prefix}…`)).toBeInTheDocument();
    });

    it("rotating a token shows the new one-time reveal panel", async () => {
        mockRotateCustomerPushToken.mockResolvedValue({
            data: {
                id: "cpt-1",
                token: "fcpush_rotated",
                name: "CI runner",
                source_id: "cps-1",
                scopes: activeToken.scopes,
                expires_at: null,
            },
        });
        const user = userEvent.setup();
        render(
            <CustomerPushTokenList
                tokens={[activeToken]}
                newTokenHref="/new"
                examplesHref="/examples"
            />,
        );
        await user.click(screen.getByRole("button", { name: /rotate/i }));
        await waitFor(() => {
            expect(screen.getByText("fcpush_rotated")).toBeInTheDocument();
        });
    });

    it("revoking a token requires confirmation, then disables rotate/revoke", async () => {
        mockRevokeCustomerPushToken.mockResolvedValue({ data: undefined });
        const user = userEvent.setup();
        render(
            <CustomerPushTokenList
                tokens={[activeToken]}
                newTokenHref="/new"
                examplesHref="/examples"
            />,
        );
        await user.click(screen.getByRole("button", { name: /^revoke$/i }));
        expect(screen.getByText(/are you sure you want to revoke/i)).toBeInTheDocument();

        await user.click(screen.getAllByRole("button", { name: /^revoke$/i })[1]);

        await waitFor(() => {
            expect(screen.getByText("Revoked")).toBeInTheDocument();
        });
        expect(screen.getByRole("button", { name: /rotate/i })).toBeDisabled();
        expect(screen.getByRole("button", { name: /^revoke$/i })).toBeDisabled();
    });
});
