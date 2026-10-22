import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";

const { grantMock, revokeMock, toastSuccess, toastError } = vi.hoisted(() => ({
    grantMock: vi.fn(),
    revokeMock: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
}));

vi.mock("@/lib/admin/server", () => ({
    grantPlatformModelFallback: grantMock,
    revokePlatformModelFallback: revokeMock,
}));
vi.mock("sonner", () => ({ toast: { success: toastSuccess, error: toastError } }));

import { PlatformModelFallbackCard } from "./PlatformModelFallbackCard";

const COST_SENTENCE =
    "Granting this means the platform pays for this org's AI calls when it has no saved model config.";

const SCOPE_SENTENCE =
    "It takes effect only while the ACR service model is on for this org; an org with it off is still refused.";

describe("PlatformModelFallbackCard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal(
            "confirm",
            vi.fn(() => true),
        );
    });

    it("shows the control to a platform admin", () => {
        render(<PlatformModelFallbackCard orgId="org-1" granted={false} isPlatformAdmin />);

        expect(screen.getByRole("heading", { name: "Platform model fallback" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Grant as platform admin" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Revoke as platform admin" })).toBeDisabled();
        expect(screen.getByText("Not granted")).toBeVisible();
    });

    it("renders nothing for a user who is not a platform admin", () => {
        const { container } = render(
            <PlatformModelFallbackCard orgId="org-1" granted={false} isPlatformAdmin={false} />,
        );

        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("pins the cost sentence and the platform admin term", () => {
        render(<PlatformModelFallbackCard orgId="org-1" granted={false} isPlatformAdmin />);

        expect(screen.getByText(COST_SENTENCE)).toBeVisible();
        expect(screen.getByText(/Only a platform admin can grant or revoke/)).toBeVisible();
        expect(screen.getByText(SCOPE_SENTENCE)).toBeVisible();
        expect(document.body.textContent).not.toMatch(/superuser|super admin|superadmin grant/i);
    });

    it("enables revoke and disables grant when granted", () => {
        render(<PlatformModelFallbackCard orgId="org-1" granted isPlatformAdmin />);

        expect(screen.getByText("Granted")).toBeVisible();
        expect(screen.getByRole("button", { name: "Grant as platform admin" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Revoke as platform admin" })).toBeEnabled();
    });

    it("confirms with the cost sentence, then calls grant for the org", async () => {
        grantMock.mockResolvedValue({
            data: { changed: true, notice: "Platform admin grant saved." },
        });
        render(<PlatformModelFallbackCard orgId="org-1" granted={false} isPlatformAdmin />);

        await userEvent.click(screen.getByRole("button", { name: "Grant as platform admin" }));

        expect(confirm).toHaveBeenCalledWith(COST_SENTENCE);
        await waitFor(() => expect(grantMock).toHaveBeenCalledExactlyOnceWith("org-1"));
        expect(toastSuccess).toHaveBeenCalledWith("Platform admin grant saved.");
    });

    it("does not call grant when the confirm is declined", async () => {
        vi.stubGlobal(
            "confirm",
            vi.fn(() => false),
        );
        render(<PlatformModelFallbackCard orgId="org-1" granted={false} isPlatformAdmin />);

        await userEvent.click(screen.getByRole("button", { name: "Grant as platform admin" }));

        expect(grantMock).not.toHaveBeenCalled();
    });

    it("calls revoke for the org without a cost confirm", async () => {
        revokeMock.mockResolvedValue({
            data: { changed: true, notice: "Platform admin grant removed." },
        });
        render(<PlatformModelFallbackCard orgId="org-1" granted isPlatformAdmin />);

        await userEvent.click(screen.getByRole("button", { name: "Revoke as platform admin" }));

        await waitFor(() => expect(revokeMock).toHaveBeenCalledExactlyOnceWith("org-1"));
        expect(toastSuccess).toHaveBeenCalledWith("Platform admin grant removed.");
        expect(confirm).not.toHaveBeenCalled();
    });

    it("shows the error from a refused action", async () => {
        revokeMock.mockResolvedValue({ error: "Forbidden" });
        render(<PlatformModelFallbackCard orgId="org-1" granted isPlatformAdmin />);

        await userEvent.click(screen.getByRole("button", { name: "Revoke as platform admin" }));

        await waitFor(() => expect(toastError).toHaveBeenCalledWith("Failed to revoke: Forbidden"));
    });
});
