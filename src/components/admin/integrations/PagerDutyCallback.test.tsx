import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PagerDutyCallback } from "./PagerDutyCallback";

const actions = vi.hoisted(() => ({ completePagerDutyOAuth: vi.fn() }));
const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
const callbackSearch = vi.hoisted(() => ({ value: "state=callback-state&code=callback-code" }));
const callbackPath = "/org/admin/integrations/pagerduty/callback";

vi.mock("next/navigation", () => ({
    useRouter: () => navigation,
    useSearchParams: () => new URLSearchParams(callbackSearch.value),
}));
vi.mock("@/lib/admin/server", () => ({ completePagerDutyOAuth: actions.completePagerDutyOAuth }));

describe("PagerDutyCallback", () => {
    beforeEach(() => {
        actions.completePagerDutyOAuth.mockReset();
        navigation.replace.mockReset();
        callbackSearch.value = "state=callback-state&code=callback-code";
        window.history.replaceState(
            window.history.state,
            "",
            `${callbackPath}?${callbackSearch.value}`,
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.history.replaceState(window.history.state, "", "/");
    });

    it("submits once, sanitizes callback query values, and hands the created credential to New Sync Config", async () => {
        actions.completePagerDutyOAuth.mockResolvedValue({
            data: {
                connected: true,
                credential_name: "production",
                region: "us",
                subdomain: "acme",
                granted_scopes: [],
            },
        });

        render(
            <StrictMode>
                <PagerDutyCallback />
            </StrictMode>,
        );

        await waitFor(() => expect(navigation.replace).toHaveBeenCalledOnce());
        expect(actions.completePagerDutyOAuth).toHaveBeenCalledTimes(1);
        expect(actions.completePagerDutyOAuth).toHaveBeenCalledWith({
            state: "callback-state",
            code: "callback-code",
        });
        expect(navigation.replace).toHaveBeenCalledWith(
            "/org/admin/sync/new?provider=pagerduty&credential_name=production",
        );
        expect(window.location.pathname).toBe(callbackPath);
        expect(window.location.search).toBe("?state=callback-state&code=callback-code");
    });

    it("fails safely without an incomplete callback response", () => {
        callbackSearch.value = "state=callback-state";
        render(<PagerDutyCallback />);

        expect(actions.completePagerDutyOAuth).not.toHaveBeenCalled();
        expect(navigation.replace).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(
            "PagerDuty did not return a complete authorization response.",
        );
    });

    it("keeps the provider-management recovery path when callback completion fails", async () => {
        actions.completePagerDutyOAuth.mockResolvedValue({ error: "Authorization was denied." });
        render(<PagerDutyCallback />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Authorization was denied.");
        expect(navigation.replace).not.toHaveBeenCalled();
        expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute(
            "href",
            "/org/admin/integrations/pagerduty",
        );
    });
});
