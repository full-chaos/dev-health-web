import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SocialLoginError } from "./SocialLoginError";

// CHAOS-13035: one fixed sentence for each of the five SsoFailureCode values. None names an
// organization, a provider or an account.
const SSO_CODES = [
    "sso_not_member",
    "sso_identity_conflict",
    "sso_not_licensed",
    "sso_unavailable",
    "sso_failed",
] as const;
const GENERIC = "An error occurred during sign in. Please try again.";

describe("SocialLoginError SSO codes", () => {
    it.each(SSO_CODES)("%s has its own sentence, not the generic one", (code) => {
        const { container } = render(<SocialLoginError error={code} />);
        const text = container.textContent ?? "";
        expect(text).not.toBe("");
        expect(text).not.toBe(GENERIC);
        expect(text.toLowerCase()).toContain("single sign-on");
    });

    it("the five sentences differ from each other", () => {
        const texts = SSO_CODES.map(
            (code) => render(<SocialLoginError error={code} />).container.textContent,
        );
        expect(new Set(texts).size).toBe(SSO_CODES.length);
    });

    it("an unknown code still gets the generic sentence", () => {
        const { container } = render(<SocialLoginError error="sso_other" />);
        expect(container.textContent).toBe(GENERIC);
    });
});
