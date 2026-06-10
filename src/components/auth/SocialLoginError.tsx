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
    refresh_failed:
        "Your previous session expired. Please sign in again with your email and password.",
};

export function SocialLoginError({ error }: SocialLoginErrorProps) {
    const message = ERROR_MESSAGES[error] ?? "An error occurred during sign in. Please try again.";
    return <span>{message}</span>;
}
