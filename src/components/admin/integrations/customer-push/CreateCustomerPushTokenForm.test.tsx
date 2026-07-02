import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";

const mockCreateCustomerPushToken = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    createCustomerPushToken: (...args: unknown[]) => mockCreateCustomerPushToken(...args),
}));

import { CreateCustomerPushTokenForm } from "./CreateCustomerPushTokenForm";

describe("CreateCustomerPushTokenForm", () => {
    afterEach(() => {
        mockCreateCustomerPushToken.mockReset();
    });

    it("defaults all 3 v1 scopes to checked and shows disabled provider-specific scopes (D7)", () => {
        render(
            <CreateCustomerPushTokenForm
                sourceId="cps-1"
                examplesHref="/examples"
                credentialsHref="/credentials"
            />,
        );
        expect(screen.getByRole("checkbox", { name: /schema:read/i })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: /ingest:write/i })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: /ingest:status/i })).toBeChecked();

        const providerScope = screen.getByText("ingest:github").closest("span");
        const providerCheckbox = providerScope?.querySelector("input[type=checkbox]");
        expect(providerCheckbox).toBeDisabled();
    });

    it("renders the one-time TokenRevealPanel after a successful create, replacing the form", async () => {
        mockCreateCustomerPushToken.mockResolvedValue({
            data: {
                id: "cpt-1",
                token: "fcpush_newtoken",
                name: "CI runner",
                source_id: "cps-1",
                scopes: ["schema:read", "ingest:write", "ingest:status"],
                expires_at: null,
            },
        });
        const user = userEvent.setup();
        render(
            <CreateCustomerPushTokenForm
                sourceId="cps-1"
                examplesHref="/examples"
                credentialsHref="/credentials"
            />,
        );
        await user.click(screen.getByRole("button", { name: /create credential/i }));

        await waitFor(() => {
            expect(screen.getByText("fcpush_newtoken")).toBeInTheDocument();
        });
        // The create form (with its scope checkboxes) must be gone now.
        expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("disables submit when all scopes are unchecked", async () => {
        const user = userEvent.setup();
        render(
            <CreateCustomerPushTokenForm
                sourceId="cps-1"
                examplesHref="/examples"
                credentialsHref="/credentials"
            />,
        );
        await user.click(screen.getByRole("checkbox", { name: /schema:read/i }));
        await user.click(screen.getByRole("checkbox", { name: /ingest:write/i }));
        await user.click(screen.getByRole("checkbox", { name: /ingest:status/i }));

        expect(screen.getByRole("button", { name: /create credential/i })).toBeDisabled();
    });
});
