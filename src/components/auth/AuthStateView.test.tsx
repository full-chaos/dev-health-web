import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The real notFound() never returns; the mock returns nothing so React renders an empty tree.
const notFoundMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

import { AuthStateView } from "./AuthStateView";
import { SERVICE_UNAVAILABLE_TITLE } from "@/components/ServiceUnavailable";
import { reasonToState } from "@/lib/auth/reasonStates";

const SERVER_TEXT = "server-said-secret-detail-xyz";

describe("AuthStateView", () => {
    beforeEach(() => notFoundMock.mockClear());

    it("signin renders a link to /auth/signin", () => {
        render(<AuthStateView reason="session_expired" message={SERVER_TEXT} />);
        expect(screen.getByRole("link").getAttribute("href")).toBe("/auth/signin");
        expect(document.body.textContent).not.toContain(SERVER_TEXT);
    });

    it("denied renders the fixed denied text", () => {
        render(<AuthStateView reason="grant_absent" message={SERVER_TEXT} />);
        expect(screen.getByText(reasonToState("grant_absent").message)).toBeTruthy();
        expect(document.body.textContent).not.toContain(SERVER_TEXT);
    });

    it("entitlement with the caller's feature renders UpgradeGate", () => {
        render(
            <AuthStateView
                reason="not_entitled"
                upgrade={{ feature: "investment_view", requiredTier: "team" }}
                message={SERVER_TEXT}
            />,
        );
        expect(document.body.textContent).toMatch(/plan feature/i);
        expect(document.body.textContent).toMatch(/investment view/i);
        expect(document.body.textContent).not.toContain(SERVER_TEXT);
    });

    it("entitlement without a feature renders the fixed entitlement text", () => {
        render(<AuthStateView reason="not_entitled" message={SERVER_TEXT} />);
        expect(screen.getByText(reasonToState("not_entitled").message)).toBeTruthy();
        expect(document.body.textContent).not.toMatch(/plan feature/i);
        expect(document.body.textContent).not.toContain(SERVER_TEXT);
    });

    it("unavailable renders ServiceUnavailable", () => {
        render(<AuthStateView reason="store_unavailable" message={SERVER_TEXT} />);
        expect(screen.getByText(SERVICE_UNAVAILABLE_TITLE)).toBeTruthy();
        expect(document.body.textContent).not.toContain(SERVER_TEXT);
    });

    it("notfound calls notFound()", () => {
        render(<AuthStateView reason="not_found" message={SERVER_TEXT} />);
        expect(notFoundMock).toHaveBeenCalled();
        expect(document.body.textContent).not.toContain(SERVER_TEXT);
    });

    it("hidden + deny code calls notFound()", () => {
        render(<AuthStateView reason="grant_absent" hidden message={SERVER_TEXT} />);
        expect(notFoundMock).toHaveBeenCalled();
        expect(document.body.textContent).not.toContain(SERVER_TEXT);
    });
});
