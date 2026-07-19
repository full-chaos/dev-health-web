import { StrictMode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PagerDutyCallback } from "./PagerDutyCallback";

const actions = vi.hoisted(() => ({
    completePagerDutyOAuth: vi.fn(),
}));

const navigation = vi.hoisted(() => ({
    search: "state=callback-state&code=callback-code",
}));
const PAGERDUTY_CALLBACK_PATH = "/org/admin/integrations/pagerduty/callback";
const PAGERDUTY_CALLBACK_QUERY = "?state=callback-state&code=callback-code";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock("@/lib/admin/server", () => ({
    completePagerDutyOAuth: actions.completePagerDutyOAuth,
}));

describe("PagerDutyCallback", () => {
    beforeEach(() => {
        actions.completePagerDutyOAuth.mockReset();
        navigation.search = "state=callback-state&code=callback-code";
        window.history.replaceState(
            window.history.state,
            "",
            `${PAGERDUTY_CALLBACK_PATH}${PAGERDUTY_CALLBACK_QUERY}`,
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.history.replaceState(window.history.state, "", "/");
    });

    it("submits once under StrictMode and keeps success after a late duplicate error", async () => {
        let resolveLateDuplicate = (_result: { readonly error: string }) => {};
        const lateDuplicate = new Promise<{ readonly error: string }>((resolve) => {
            resolveLateDuplicate = resolve;
        });
        actions.completePagerDutyOAuth
            .mockResolvedValueOnce({ data: {} })
            .mockImplementationOnce(() => lateDuplicate);

        render(
            <StrictMode>
                <PagerDutyCallback />
            </StrictMode>,
        );

        await waitFor(() =>
            expect(screen.getByRole("status")).toHaveTextContent(
                "PagerDuty is connected. You can now configure the datasets to sync.",
            ),
        );

        await act(async () => {
            resolveLateDuplicate({ error: "A late duplicate callback failed." });
        });

        expect(actions.completePagerDutyOAuth).toHaveBeenCalledTimes(1);
        expect(actions.completePagerDutyOAuth).toHaveBeenCalledWith({
            state: "callback-state",
            code: "callback-code",
        });
        expect(screen.getByRole("status")).toHaveTextContent(
            "PagerDuty is connected. You can now configure the datasets to sync.",
        );
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("removes provider callback query values before and after invoking the callback action", async () => {
        const invocationOrder: string[] = [];
        const originalReplaceState = window.history.replaceState;
        const replaceState = vi
            .spyOn(window.history, "replaceState")
            .mockImplementation((...args) => {
                invocationOrder.push("replace");
                return originalReplaceState.apply(window.history, args);
            });
        actions.completePagerDutyOAuth.mockImplementation(async () => {
            invocationOrder.push("action");
            return { data: {} };
        });

        render(
            <StrictMode>
                <PagerDutyCallback />
            </StrictMode>,
        );

        await waitFor(() => expect(actions.completePagerDutyOAuth).toHaveBeenCalledOnce());

        expect(replaceState).toHaveBeenCalledWith(
            window.history.state,
            "",
            "/org/admin/integrations/pagerduty/callback",
        );
        expect(invocationOrder).toEqual(["replace", "action"]);
        expect(actions.completePagerDutyOAuth).toHaveBeenCalledWith({
            state: "callback-state",
            code: "callback-code",
        });
        expect(window.location.pathname).toBe(PAGERDUTY_CALLBACK_PATH);
        expect(window.location.search).toBe("");
    });

    it("re-sanitizes the callback URL when a late reconciliation restores the query after success", async () => {
        actions.completePagerDutyOAuth.mockResolvedValue({ data: {} });

        const view = render(
            <StrictMode>
                <PagerDutyCallback />
            </StrictMode>,
        );

        await waitFor(() =>
            expect(screen.getByRole("status")).toHaveTextContent(
                "PagerDuty is connected. You can now configure the datasets to sync.",
            ),
        );

        navigation.search = "";
        view.rerender(
            <StrictMode>
                <PagerDutyCallback />
            </StrictMode>,
        );
        window.history.pushState(
            window.history.state,
            "",
            `${PAGERDUTY_CALLBACK_PATH}${PAGERDUTY_CALLBACK_QUERY}`,
        );
        navigation.search = "state=callback-state&code=callback-code";
        view.rerender(
            <StrictMode>
                <PagerDutyCallback />
            </StrictMode>,
        );

        expect(actions.completePagerDutyOAuth).toHaveBeenCalledOnce();
        expect(window.location.pathname).toBe(PAGERDUTY_CALLBACK_PATH);
        expect(window.location.search).toBe("");
    });

    it("re-sanitizes the callback URL when a late reconciliation restores the query after an error", async () => {
        actions.completePagerDutyOAuth.mockResolvedValue({ error: "Authorization was denied." });

        const view = render(
            <StrictMode>
                <PagerDutyCallback />
            </StrictMode>,
        );

        await waitFor(() =>
            expect(screen.getByRole("alert")).toHaveTextContent("Authorization was denied."),
        );

        navigation.search = "";
        view.rerender(
            <StrictMode>
                <PagerDutyCallback />
            </StrictMode>,
        );
        window.history.pushState(
            window.history.state,
            "",
            `${PAGERDUTY_CALLBACK_PATH}${PAGERDUTY_CALLBACK_QUERY}`,
        );
        navigation.search = "state=callback-state&code=callback-code";
        view.rerender(
            <StrictMode>
                <PagerDutyCallback />
            </StrictMode>,
        );

        expect(actions.completePagerDutyOAuth).toHaveBeenCalledOnce();
        expect(window.location.pathname).toBe(PAGERDUTY_CALLBACK_PATH);
        expect(window.location.search).toBe("");
    });

    it("uses the negative semantic treatment for callback errors", async () => {
        actions.completePagerDutyOAuth.mockResolvedValue({ error: "Authorization was denied." });
        render(<PagerDutyCallback />);

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Authorization was denied.");
        expect(alert).toContainElement(screen.getByTestId("data-state-error"));
        expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute(
            "href",
            "/org/admin/integrations/pagerduty",
        );
    });
});
