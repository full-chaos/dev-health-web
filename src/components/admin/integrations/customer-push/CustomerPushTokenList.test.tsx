import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

vi.mock("@/lib/admin/server", () => ({
    rotateCustomerPushToken: vi.fn(),
    revokeCustomerPushToken: vi.fn(),
    deleteCredential: vi.fn(),
    testConnection: vi.fn(),
    createCredential: vi.fn(),
}));

import {
    rotateCustomerPushToken,
    revokeCustomerPushToken,
    deleteCredential,
    testConnection,
    createCredential,
} from "@/lib/admin/server";
import { CustomerPushTokenList } from "./CustomerPushTokenList";
import type { CustomerPushToken } from "@/lib/admin/types";

function makeToken(overrides: Partial<CustomerPushToken> = {}): CustomerPushToken {
    return {
        id: "tok-1",
        org_id: "org-1",
        source_id: "src-1",
        name: "ci-runner",
        token_prefix: "fcpush_ab",
        scopes: [],
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
        created_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

function renderList(tokens: CustomerPushToken[]) {
    return renderWithToaster(
        <CustomerPushTokenList tokens={tokens} newTokenHref="/new" examplesHref="/examples" />,
    );
}

describe("CustomerPushTokenList kind", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("labels every row External Push and never Integration", () => {
        renderList([makeToken(), makeToken({ id: "tok-2", name: "relay" })]);
        expect(screen.getAllByText("External Push")).toHaveLength(2);
        expect(screen.queryByText("Integration")).not.toBeInTheDocument();
    });

    it("rotate calls only the lifecycle rotate action", async () => {
        vi.mocked(rotateCustomerPushToken).mockResolvedValue({ error: "nope" } as never);
        renderList([makeToken()]);
        await userEvent.click(screen.getByRole("button", { name: /rotate/i }));
        await waitFor(() => expect(rotateCustomerPushToken).toHaveBeenCalledWith("tok-1"));
        expect(revokeCustomerPushToken).not.toHaveBeenCalled();
        expect(deleteCredential).not.toHaveBeenCalled();
        expect(testConnection).not.toHaveBeenCalled();
        expect(createCredential).not.toHaveBeenCalled();
    });

    it("revoke calls only the lifecycle revoke action", async () => {
        vi.mocked(revokeCustomerPushToken).mockResolvedValue({ data: {} } as never);
        renderList([makeToken()]);
        await userEvent.click(screen.getByRole("button", { name: /^revoke$/i }));
        const buttons = screen.getAllByRole("button", { name: /^revoke$/i });
        await userEvent.click(buttons[buttons.length - 1]);
        await waitFor(() => expect(revokeCustomerPushToken).toHaveBeenCalledWith("tok-1"));
        expect(rotateCustomerPushToken).not.toHaveBeenCalled();
        expect(deleteCredential).not.toHaveBeenCalled();
    });
});
