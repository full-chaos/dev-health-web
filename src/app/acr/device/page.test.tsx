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
    DeviceApprovalForm: ({
        initialState,
        initialUserCode,
    }: {
        readonly initialState?: string;
        readonly initialUserCode?: string;
    }) => (
        <div
            data-initial-state={initialState}
            data-initial-user-code={initialUserCode}
            data-testid="device-approval-form"
        />
    ),
}));

import DeviceApprovalPage from "./page";

function searchParams(userCode?: string): Promise<{ user_code?: string }> {
    return Promise.resolve(userCode === undefined ? {} : { user_code: userCode });
}

const VALID_CODE = "EP23TUGG";

describe("DeviceApprovalPage", () => {
    beforeEach(() => {
        authMock.mockResolvedValue({
            access_token: "ops-token",
            user: { id: "user-1", org_id: "org-1", real_org_id: "org-1" },
        });
    });

    afterEach(() => vi.clearAllMocks());

    it("renders organization-wide approval without consulting the analytics repository catalog", async () => {
        render(await DeviceApprovalPage({ searchParams: searchParams(undefined) }));

        expect(screen.getByTestId("device-approval-form")).toBeVisible();
        expect(listAuthorizedRepositoriesMock).not.toHaveBeenCalled();
    });

    it("redirects a logged-out user back to device approval after sign-in", async () => {
        authMock.mockResolvedValue(null);

        await expect(DeviceApprovalPage({ searchParams: searchParams(undefined) })).rejects.toThrow(
            "NEXT_REDIRECT:/auth/signin?callbackUrl=%2Facr%2Fdevice",
        );
    });

    it("carries a valid prefilled user_code through the sign-in redirect", async () => {
        authMock.mockResolvedValue(null);

        await expect(
            DeviceApprovalPage({ searchParams: searchParams(VALID_CODE) }),
        ).rejects.toThrow(
            `NEXT_REDIRECT:/auth/signin?callbackUrl=${encodeURIComponent(
                `/acr/device?user_code=${VALID_CODE}`,
            )}`,
        );
    });

    it("keeps device approval unavailable while impersonating", async () => {
        authMock.mockResolvedValue({
            access_token: "ops-token",
            user: { id: "user-1", org_id: "org-impersonated", real_org_id: "org-1" },
        });

        render(await DeviceApprovalPage({ searchParams: searchParams(undefined) }));

        expect(screen.getByTestId("device-approval-form")).toHaveAttribute(
            "data-initial-state",
            "denied",
        );
        expect(listAuthorizedRepositoriesMock).not.toHaveBeenCalled();
    });

    it("forwards a well-formed user_code from the query string as a prefill", async () => {
        render(await DeviceApprovalPage({ searchParams: searchParams(VALID_CODE) }));

        expect(screen.getByTestId("device-approval-form")).toHaveAttribute(
            "data-initial-user-code",
            VALID_CODE,
        );
    });

    it("accepts a lowercase, whitespace-padded user_code the same as the typed-entry normalization does", async () => {
        render(await DeviceApprovalPage({ searchParams: searchParams("  ep23tugg  ") }));

        expect(screen.getByTestId("device-approval-form")).toHaveAttribute(
            "data-initial-user-code",
            VALID_CODE,
        );
    });

    it.each([
        ["too short", "EP23TUG"],
        ["too long", "EP23TUGGG"],
        ["confusable glyphs excluded from the alphabet", "OOOOOOOO"],
        ["non-alphabet characters", "EP23TU!!"],
    ])("does not forward a malformed user_code (%s) as a prefill", async (_label, malformed) => {
        render(await DeviceApprovalPage({ searchParams: searchParams(malformed) }));

        expect(screen.getByTestId("device-approval-form")).not.toHaveAttribute(
            "data-initial-user-code",
        );
    });
});
