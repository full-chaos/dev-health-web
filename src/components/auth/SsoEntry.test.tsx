import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SsoEntry } from "./SsoEntry";

// CHAOS-13035: the sign-in entry for an admin-shared provider id. There is no provider lookup, so
// the user picks the protocol and pastes the id; the page then goes to the start route.

const PROVIDER = "6f1d0f6e-62a1-4b3a-9f0e-1f2b3c4d5e6f";
const assign = vi.fn();

function mountWithLocation(ui: React.ReactElement) {
    Object.defineProperty(window, "location", {
        configurable: true,
        value: { ...window.location, assign },
    });
    return render(ui);
}

afterEach(() => assign.mockReset());

describe("SsoEntry", () => {
    it("goes to the OIDC start route for a valid provider id", () => {
        mountWithLocation(<SsoEntry />);
        fireEvent.change(screen.getByLabelText(/provider id/i), { target: { value: PROVIDER } });
        fireEvent.click(screen.getByRole("button", { name: /single sign-on/i }));
        expect(assign).toHaveBeenCalledWith(`/auth/sso/oidc/${PROVIDER}`);
    });

    it("goes to the SAML start route when SAML is chosen, carrying the callbackUrl", () => {
        mountWithLocation(<SsoEntry callbackUrl="/org/7?tab=x" />);
        fireEvent.change(screen.getByLabelText(/protocol/i), { target: { value: "saml" } });
        fireEvent.change(screen.getByLabelText(/provider id/i), {
            target: { value: ` ${PROVIDER} ` },
        });
        fireEvent.click(screen.getByRole("button", { name: /single sign-on/i }));
        expect(assign).toHaveBeenCalledWith(
            `/auth/sso/saml/${PROVIDER}?callbackUrl=${encodeURIComponent("/org/7?tab=x")}`,
        );
    });

    it("refuses an id that is not a UUID and does not navigate", () => {
        mountWithLocation(<SsoEntry />);
        fireEvent.change(screen.getByLabelText(/provider id/i), { target: { value: "../admin" } });
        fireEvent.click(screen.getByRole("button", { name: /single sign-on/i }));
        expect(assign).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toBeInTheDocument();
    });
});
