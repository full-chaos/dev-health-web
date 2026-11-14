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

// CHAOS-13756: a refused social sign-in lands on /auth/signin?error=social_<reason>; each of the seven
// sign-in reasons has its own sentence. None says whether another account exists.
const SOCIAL_TEXTS = {
    social_email_unverified:
        "The sign-in provider has not verified your email address. Verify it with the provider, then try again.",
    social_identity_conflict:
        "This sign-in could not be completed. Contact your administrator if this continues.",
    social_signup_unavailable:
        "Sign-up with this provider is not available. Sign in with an existing account or contact your administrator.",
    social_principal_deactivated: "This account is disabled. Contact your administrator.",
    social_invalid_credentials:
        "The sign-in provider did not accept this sign-in. Please try again.",
    social_malformed:
        "The sign-in provider returned an account that cannot be used. Please try again or use another sign-in method.",
    social_dependency_unavailable:
        "This sign-in method is not available right now. Please try again later or use another sign-in method.",
} as const;

describe("SocialLoginError social refusal codes", () => {
    it.each(Object.entries(SOCIAL_TEXTS))("%s shows its sentence", (code, text) => {
        const { container } = render(<SocialLoginError error={code} />);
        expect(container.textContent).toBe(text);
    });

    it("social_login_failed keeps its sentence", () => {
        const { container } = render(<SocialLoginError error="social_login_failed" />);
        expect(container.textContent).toBe(
            "Social login failed. Please try again or use email and password.",
        );
    });

    it.each([
        "social_expired",
        "social_principal_not_found",
        "social_last_sign_in_method",
        "email_unverified",
    ])("%s is no sign-in code: the generic sentence", (code) => {
        const { container } = render(<SocialLoginError error={code} />);
        expect(container.textContent).toBe(GENERIC);
    });
});
