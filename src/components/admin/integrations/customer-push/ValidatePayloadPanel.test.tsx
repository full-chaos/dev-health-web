import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { ValidatePayloadPanel } from "./ValidatePayloadPanel";
import { validateCustomerPushPayload } from "@/lib/admin/server";

vi.mock("@/lib/admin/server", () => ({
    validateCustomerPushPayload: vi.fn(),
}));

const mockValidate = vi.mocked(validateCustomerPushPayload);

beforeEach(() => {
    mockValidate.mockReset();
});

describe("ValidatePayloadPanel", () => {
    it("never renders a push CTA — Screen 5 is validate-only in v1 (CC25 overrule)", () => {
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="meridian/api"
            />,
        );
        expect(screen.queryByText(/push this payload/i)).not.toBeInTheDocument();
    });

    it("shows a parse error for invalid JSON without calling the server", async () => {
        const user = userEvent.setup();
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="meridian/api"
            />,
        );
        await user.click(screen.getByPlaceholderText(/schemaVersion/));
        await user.paste("{not json");
        await user.click(screen.getByRole("button", { name: "Validate payload" }));

        expect(await screen.findByText(/isn't valid JSON/)).toBeInTheDocument();
        expect(mockValidate).not.toHaveBeenCalled();
    });

    it("renders the rejected-record table for an invalid result", async () => {
        mockValidate.mockResolvedValue({
            data: {
                valid: false,
                items_accepted: 0,
                items_rejected: 1,
                errors: [
                    {
                        index: 0,
                        kind: "pull_request.v1",
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
                sourceInstance="meridian/api"
            />,
        );
        await user.click(screen.getByPlaceholderText(/schemaVersion/));
        await user.paste('{"records":[]}');
        await user.click(screen.getByRole("button", { name: "Validate payload" }));

        expect(await screen.findByText("externalId is required")).toBeInTheDocument();
        expect(screen.queryByText(/push this payload/i)).not.toBeInTheDocument();
    });

    it("renders the accepted-count success state for a valid result", async () => {
        mockValidate.mockResolvedValue({
            data: { valid: true, items_accepted: 3, items_rejected: 0, errors: [] },
        });
        const user = userEvent.setup();
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="meridian/api"
            />,
        );
        await user.click(screen.getByPlaceholderText(/schemaVersion/));
        await user.paste('{"records":[]}');
        await user.click(screen.getByRole("button", { name: "Validate payload" }));

        expect(await screen.findByText(/Payload is valid/)).toBeInTheDocument();
    });

    it("distinguishes a network/API error from a schema-invalid result", async () => {
        mockValidate.mockResolvedValue({ error: "Internal server error" });
        const user = userEvent.setup();
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="meridian/api"
            />,
        );
        await user.click(screen.getByPlaceholderText(/schemaVersion/));
        await user.paste('{"records":[]}');
        await user.click(screen.getByRole("button", { name: "Validate payload" }));

        expect(await screen.findByText(/Validation request failed/)).toBeInTheDocument();
    });

    it("pre-fills a sample payload for the source system when switching to sample mode", async () => {
        const user = userEvent.setup();
        render(
            <ValidatePayloadPanel
                sourceId="cps-1"
                sourceSystem="github"
                sourceInstance="meridian/api"
            />,
        );
        await user.click(screen.getByRole("button", { name: "Use sample" }));
        const textarea = screen.getByPlaceholderText(/schemaVersion/) as HTMLTextAreaElement;
        expect(textarea.value).toContain("meridian/api");
        expect(textarea.value).toContain("repository.v1");
    });
});
