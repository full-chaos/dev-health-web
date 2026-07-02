import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";
import { CreateCustomerPushSourceForm } from "./CreateCustomerPushSourceForm";
import { createCustomerPushSource } from "@/lib/admin/server";

vi.mock("@/lib/admin/server", () => ({
    createCustomerPushSource: vi.fn(),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
}));

const mockCreate = vi.mocked(createCustomerPushSource);

beforeEach(() => {
    mockCreate.mockReset();
    mockPush.mockReset();
});

describe("CreateCustomerPushSourceForm", () => {
    it("shows the missing-instance validation message without calling the server", async () => {
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="github" providerName="GitHub" />);

        await user.click(screen.getByRole("button", { name: "Create customer-push source" }));

        expect(screen.getByText(/enter a stable provider instance/i)).toBeInTheDocument();
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("redirects to the new source overview on success", async () => {
        mockCreate.mockResolvedValue({ data: { id: "cps-99" } as never });
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="github" providerName="GitHub" />);

        await user.type(screen.getByLabelText(/repository full name/i), "meridian/api");
        await user.click(screen.getByRole("button", { name: "Create customer-push source" }));

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith(
                "/org/admin/integrations/github/customer-push/cps-99",
            );
        });
    });

    it("renders the real backend message verbatim for a managed-sync ownership 409", async () => {
        mockCreate.mockResolvedValue({
            error:
                "A managed github sync source already owns 'meridian/api' in this organization; " +
                "disable it before enabling customer-push for the same instance.",
        });
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="github" providerName="GitHub" />);

        await user.type(screen.getByLabelText(/repository full name/i), "meridian/api");
        await user.click(screen.getByRole("button", { name: "Create customer-push source" }));

        expect(await screen.findByText("One-active-owner conflict")).toBeInTheDocument();
        expect(
            screen.getByText(/A managed github sync source already owns 'meridian\/api'/),
        ).toBeInTheDocument();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("renders the real backend message verbatim for a duplicate-registration 409", async () => {
        mockCreate.mockResolvedValue({
            error:
                "A source is already registered for system='github' instance='meridian/api' " +
                "in this organization",
        });
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="github" providerName="GitHub" />);

        await user.type(screen.getByLabelText(/repository full name/i), "meridian/api");
        await user.click(screen.getByRole("button", { name: "Create customer-push source" }));

        expect(await screen.findByText("One-active-owner conflict")).toBeInTheDocument();
    });

    it("renders an unrelated error as a generic banner, not a conflict", async () => {
        mockCreate.mockResolvedValue({ error: "Internal server error" });
        const user = userEvent.setup();
        render(<CreateCustomerPushSourceForm provider="github" providerName="GitHub" />);

        await user.type(screen.getByLabelText(/repository full name/i), "meridian/api");
        await user.click(screen.getByRole("button", { name: "Create customer-push source" }));

        expect(await screen.findByText("Internal server error")).toBeInTheDocument();
        expect(screen.queryByText("One-active-owner conflict")).not.toBeInTheDocument();
    });
});
