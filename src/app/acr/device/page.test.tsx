import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
});
const authMock = vi.fn();
const listAuthorizedRepositoriesMock = vi.fn();

vi.mock("next/navigation", () => ({
    redirect: (url: string) => redirectMock(url),
}));
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/acr/service", () => ({
    listAuthorizedRepositories: listAuthorizedRepositoriesMock,
}));
vi.mock("@/components/acr/DeviceApprovalForm", () => ({
    DeviceApprovalForm: ({ initialState }: { readonly initialState?: string }) => (
        <div data-initial-state={initialState} data-testid="device-approval-form" />
    ),
}));

import DeviceApprovalPage from "./page";

describe("DeviceApprovalPage", () => {
    beforeEach(() => {
        authMock.mockResolvedValue({
            access_token: "ops-token",
            user: { id: "user-1", org_id: "org-1", real_org_id: "org-1" },
        });
    });

    afterEach(() => vi.clearAllMocks());

    it("renders organization-wide approval without consulting the analytics repository catalog", async () => {
        render(await DeviceApprovalPage());

        expect(screen.getByTestId("device-approval-form")).toBeVisible();
        expect(listAuthorizedRepositoriesMock).not.toHaveBeenCalled();
    });

    it("redirects a logged-out user back to device approval after sign-in", async () => {
        authMock.mockResolvedValue(null);

        await expect(DeviceApprovalPage()).rejects.toThrow(
            "NEXT_REDIRECT:/auth/signin?callbackUrl=%2Facr%2Fdevice",
        );
    });

    it("keeps device approval unavailable while impersonating", async () => {
        authMock.mockResolvedValue({
            access_token: "ops-token",
            user: { id: "user-1", org_id: "org-impersonated", real_org_id: "org-1" },
        });

        render(await DeviceApprovalPage());

        expect(screen.getByTestId("device-approval-form")).toHaveAttribute(
            "data-initial-state",
            "denied",
        );
        expect(listAuthorizedRepositoriesMock).not.toHaveBeenCalled();
    });
});
