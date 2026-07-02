import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));

const mockCreateCustomerPushSource = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    createCustomerPushSource: (...args: unknown[]) => mockCreateCustomerPushSource(...args),
}));

import { CreateCustomerPushSourceForm } from "./CreateCustomerPushSourceForm";

describe("CreateCustomerPushSourceForm", () => {
    afterEach(() => {
        mockPush.mockReset();
        mockCreateCustomerPushSource.mockReset();
    });

    it("shows a field error instead of submitting when instance is whitespace-only", async () => {
        // The <input required> attribute already blocks a fully-empty
        // submit natively; a whitespace-only value passes that native check
        // so it reaches the component's own .trim() validation.
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="github" providerName="GitHub" />);
        await user.type(screen.getByLabelText(/repository full name/i), "   ");
        await user.click(screen.getByRole("button", { name: /create customer-push source/i }));
        expect(screen.getByText(/enter a stable provider instance/i)).toBeInTheDocument();
        expect(mockCreateCustomerPushSource).not.toHaveBeenCalled();
    });

    it("redirects to the new source's overview page on success", async () => {
        mockCreateCustomerPushSource.mockResolvedValue({
            data: { id: "cps-99", instance: "acme/api" },
        });
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="github" providerName="GitHub" />);
        await user.type(screen.getByLabelText(/repository full name/i), "acme/api");
        await user.click(screen.getByRole("button", { name: /create customer-push source/i }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith(
                "/org/admin/integrations/github/customer-push/cps-99",
            );
        });
        expect(mockCreateCustomerPushSource).toHaveBeenCalledWith({
            system: "github",
            instance: "acme/api",
            display_name: "acme/api",
        });
    });

    it("renders the real backend's one-active-owner conflict message on a 409 (regression guard, not a generic error)", async () => {
        // _request.ts's formatErrorDetail falls back to JSON.stringify for
        // the real backend's {code, message} 409 detail shape (no top-level
        // "error" key) — mirror that exactly, and assert the form unwraps it
        // to clean prose rather than showing raw JSON.
        const backendMessage =
            "A managed github sync source already owns 'acme/api' in this organization; disable it before enabling customer-push for the same instance.";
        mockCreateCustomerPushSource.mockResolvedValue({
            error: JSON.stringify({
                code: "source_owned_by_fullchaos_sync",
                message: backendMessage,
            }),
        });
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="github" providerName="GitHub" />);
        await user.type(screen.getByLabelText(/repository full name/i), "acme/api");
        await user.click(screen.getByRole("button", { name: /create customer-push source/i }));

        expect(await screen.findByText(backendMessage)).toBeInTheDocument();
        expect(screen.getByText("One-active-owner conflict")).toBeInTheDocument();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("renders a generic error banner for a non-conflict failure", async () => {
        mockCreateCustomerPushSource.mockResolvedValue({ error: "Something else went wrong" });
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="jira" providerName="Jira" />);
        await user.type(screen.getByLabelText(/project key/i), "ABC");
        await user.click(screen.getByRole("button", { name: /create customer-push source/i }));

        expect(await screen.findByText("Something else went wrong")).toBeInTheDocument();
    });

    it("treats the plain-string duplicate-registration 409 as a generic error, distinct from the one-active-owner conflict", async () => {
        // Real backend's IntegrityError path (registering the exact same
        // source twice) is a plain string, not the {code,message} ownership
        // shape — must not be mislabeled as "One-active-owner conflict".
        const duplicateMessage =
            "A source is already registered for system='github' instance='acme/api' in this organization";
        mockCreateCustomerPushSource.mockResolvedValue({ error: duplicateMessage });
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="github" providerName="GitHub" />);
        await user.type(screen.getByLabelText(/repository full name/i), "acme/api");
        await user.click(screen.getByRole("button", { name: /create customer-push source/i }));

        expect(await screen.findByText(duplicateMessage)).toBeInTheDocument();
        expect(screen.queryByText("One-active-owner conflict")).not.toBeInTheDocument();
        expect(mockPush).not.toHaveBeenCalled();
    });
});
