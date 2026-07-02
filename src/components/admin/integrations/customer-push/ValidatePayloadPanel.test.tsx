import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, userEvent, waitFor } from "@/test/utils";

const mockValidateCustomerPushPayload = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    validateCustomerPushPayload: (...args: unknown[]) => mockValidateCustomerPushPayload(...args),
}));

import { ValidatePayloadPanel } from "./ValidatePayloadPanel";

describe("ValidatePayloadPanel", () => {
    afterEach(() => {
        mockValidateCustomerPushPayload.mockReset();
    });

    it("never renders a Push/Push this payload CTA — validate-only in v1 (D6/CC25 overrule)", () => {
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="acme/api"
            />,
        );
        expect(screen.queryByRole("button", { name: /push/i })).not.toBeInTheDocument();
    });

    it("renders the green valid state with accepted-record count", async () => {
        mockValidateCustomerPushPayload.mockResolvedValue({
            data: { valid: true, items_accepted: 3, items_rejected: 0, errors: [] },
        });
        const user = userEvent.setup();
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="acme/api"
            />,
        );
        await user.click(screen.getByRole("button", { name: /use sample/i }));
        await user.click(screen.getByRole("button", { name: /validate payload/i }));

        expect(await screen.findByText(/payload is valid/i)).toBeInTheDocument();
        expect(screen.getByText("No rejected records.")).toBeInTheDocument();
    });

    it("renders the rejected-record error table with index/kind/path/message on an invalid payload", async () => {
        mockValidateCustomerPushPayload.mockResolvedValue({
            data: {
                valid: false,
                items_accepted: 0,
                items_rejected: 1,
                errors: [
                    {
                        index: 0,
                        kind: "repository.v1",
                        external_id: null,
                        code: "missing_required_field",
                        path: "records[0].externalId",
                        message: "externalId is required",
                    },
                ],
            },
        });
        const user = userEvent.setup();
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="acme/api"
            />,
        );
        await user.click(screen.getByRole("button", { name: /paste json/i }));
        fireEvent.change(screen.getByPlaceholderText(/schemaVersion/), {
            target: { value: '{"schemaVersion":"external-ingest.v1","records":[]}' },
        });
        await user.click(screen.getByRole("button", { name: /validate payload/i }));

        expect(await screen.findByText(/record.*rejected/i)).toBeInTheDocument();
        expect(screen.getByText("records[0].externalId")).toBeInTheDocument();
        expect(screen.getByText("externalId is required")).toBeInTheDocument();
    });

    it("shows a JSON parse error distinct from an API/validation error", async () => {
        const user = userEvent.setup();
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="acme/api"
            />,
        );
        await user.click(screen.getByRole("button", { name: /paste json/i }));
        fireEvent.change(screen.getByPlaceholderText(/schemaVersion/), {
            target: { value: "{not valid json" },
        });
        await user.click(screen.getByRole("button", { name: /validate payload/i }));

        expect(screen.getByText(/isn't valid json/i)).toBeInTheDocument();
        expect(mockValidateCustomerPushPayload).not.toHaveBeenCalled();
    });

    it("distinguishes a network/API error from a schema-invalid (valid:false) result", async () => {
        mockValidateCustomerPushPayload.mockResolvedValue({ error: "Network error" });
        const user = userEvent.setup();
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="acme/api"
            />,
        );
        await user.click(screen.getByRole("button", { name: /use sample/i }));
        await user.click(screen.getByRole("button", { name: /validate payload/i }));

        await waitFor(() => {
            expect(screen.getByText(/validation request failed/i)).toBeInTheDocument();
        });
    });
});
