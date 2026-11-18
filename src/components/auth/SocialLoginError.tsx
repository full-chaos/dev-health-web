"use client";

type SocialLoginErrorProps = {
    error: string;
};

const ERROR_MESSAGES: Record<string, string> = {
    social_login_failed: "Social login failed. Please try again or use email and password.",
    // CHAOS-13756: a refused social sign-in, by the backend's closed detail.reason. None says whether
    // another account exists (identity_conflict is the backend's own generic text).
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
    OAuthAccountNotLinked:
        "This email is already registered with a different sign-in method. Please sign in with your original method.",
    OAuthCallbackError: "An error occurred during social login. Please try again.",
    AccessDenied: "Access was denied. Please try again.",
    sso_not_member:
        "Single sign-on is not available for this account: it is not a member of the organization.",
    sso_identity_conflict:
        "Single sign-on could not link this account to an existing sign-in. Contact your administrator.",
    sso_not_licensed:
        "Single sign-on is not included in the plan of this organization. Contact your administrator.",
    sso_unavailable: "Single sign-on is temporarily unavailable. Please try again later.",
    sso_failed: "Single sign-on failed. Please try again or use another sign-in method.",
    refresh_failed:
        "Your previous session expired. Please sign in again with your email and password.",
    refresh_rate_limited: "Wait up to 15 minutes and reload the page, or sign in again.",
};

export function SocialLoginError({ error }: SocialLoginErrorProps) {
    const message = ERROR_MESSAGES[error] ?? "An error occurred during sign in. Please try again.";
    return <span>{message}</span>;
}
