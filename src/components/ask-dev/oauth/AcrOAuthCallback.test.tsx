import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
}));

const complete = vi.fn();
vi.mock("@/lib/ask-dev/acr-auth", () => ({
    completeAcrAuthorization: (url: string) => complete(url),
}));

import { AcrOAuthCallback } from "./AcrOAuthCallback";

const CALLBACK = "/ask-dev/oauth/callback?code=c-1&state=s-1&iss=https%3A%2F%2Facr.fullchaos.dev";

/** The order things happen in: the URL scrub must come before the completion reads anything. */
let order: string[];

beforeEach(() => {
    order = [];
    replace.mockReset();
    complete.mockReset();
    window.history.replaceState(null, "", CALLBACK);
    const original = window.history.replaceState.bind(window.history);
    vi.spyOn(window.history, "replaceState").mockImplementation((...args) => {
        order.push(`scrub:${String(args[2])}`);
        original(...args);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("AcrOAuthCallback (CHAOS-12303)", () => {
    it("scrubs the URL first, completes with the full callback URL, then returns client side", async () => {
        complete.mockImplementation(async (url: string) => {
            order.push(`complete:${new URL(url).search}`);
            return { kind: "authorized", returnTo: "/dev?thread=t1" };
        });
        render(<AcrOAuthCallback />);
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/dev?thread=t1"));
        expect(order).toEqual([
            "scrub:/ask-dev/oauth/callback",
            "complete:?code=c-1&state=s-1&iss=https%3A%2F%2Facr.fullchaos.dev",
        ]);
        expect(window.location.search).toBe("");
    });

    it("completes once under StrictMode: the pending entry is single use", async () => {
        complete.mockResolvedValue({ kind: "authorized", returnTo: "/dev" });
        render(
            <StrictMode>
                <AcrOAuthCallback />
            </StrictMode>,
        );
        await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
        expect(complete).toHaveBeenCalledTimes(1);
    });

    it("shows a denied state with a way back, and does not navigate", async () => {
        complete.mockResolvedValue({ kind: "denied", error: "access_denied", returnTo: "/dev" });
        render(<AcrOAuthCallback />);
        expect(
            await screen.findByRole("heading", { name: "Ask Dev was not connected" }),
        ).toBeVisible();
        expect(screen.getByRole("link", { name: "Return to Ask Dev" })).toHaveAttribute(
            "href",
            "/dev",
        );
        expect(screen.getByTestId("ask-dev-acr-callback")).toHaveAttribute("data-state", "denied");
        expect(replace).not.toHaveBeenCalled();
    });

    it.each([
        ["no_pending", "This sign-in link is not valid here"],
        ["state_mismatch", "This sign-in link is not valid here"],
        ["wrong_tab", "This sign-in link is not valid here"],
        ["iss_mismatch", "This sign-in link is not valid here"],
        ["token_refused", "This sign-in link is not valid here"],
        ["expired", "Ask Dev could not connect"],
        ["token_unavailable", "Ask Dev could not connect"],
    ])("shows %s as a failure, naming nothing from the URL", async (reason, title) => {
        complete.mockResolvedValue({ kind: "failed", reason, returnTo: "/dev?thread=t1" });
        render(<AcrOAuthCallback />);
        expect(await screen.findByRole("heading", { name: title })).toBeVisible();
        expect(screen.getByRole("link", { name: "Return to Ask Dev" })).toHaveAttribute(
            "href",
            "/dev?thread=t1",
        );
        expect(document.body.textContent).not.toMatch(/c-1|s-1/u);
    });

    it("says it is connecting while the exchange runs", async () => {
        let resolve!: (value: unknown) => void;
        complete.mockReturnValue(new Promise((done) => (resolve = done)));
        render(<AcrOAuthCallback />);
        expect(screen.getByRole("heading", { name: "Connecting Ask Dev" })).toBeVisible();
        expect(screen.queryByRole("link")).toBeNull();
        await act(async () => resolve({ kind: "authorized", returnTo: "/dev" }));
    });
});
