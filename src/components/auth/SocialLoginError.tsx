"use client";

type SocialLoginErrorProps = {
    error: string;
};

const ERROR_MESSAGES: Record<string, string> = {
    social_login_failed: "Social login failed. Please try again or use email and password.",
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
};

export function SocialLoginError({ error }: SocialLoginErrorProps) {
    const message = ERROR_MESSAGES[error] ?? "An error occurred during sign in. Please try again.";
    return <span>{message}</span>;
}
