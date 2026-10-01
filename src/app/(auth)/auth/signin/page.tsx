import { redirect } from "next/navigation";
import { auth, getAvailableSocialProviders } from "@/lib/auth";
import { LoginForm } from "@/components/auth/LoginForm";
import { AuthCard } from "@/components/auth/AuthCard";
import { SocialLoginError } from "@/components/auth/SocialLoginError";
import { appendCallbackUrl, safePostLoginRedirect } from "@/lib/post-login-redirect";
import { Notice } from "@/components/ui/Notice";

type SearchParams = Promise<{
    registered?: string;
    plan?: string;
    trial?: string;
    error?: string;
    from?: string;
    callbackUrl?: string;
}>;

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    const plan = params.plan?.toLowerCase();
    const trialIntent = plan === "team" && params.trial === "true";
    const callbackUrl = safePostLoginRedirect(params.callbackUrl);
    const signupHref = appendCallbackUrl(
        trialIntent ? "/auth/signup?plan=team&trial=true" : "/auth/signup",
        callbackUrl,
    );

    const session = await auth();
    if (session?.user && params.from !== "reset") {
        if (session.user.needs_onboarding) {
            redirect(trialIntent ? "/auth/onboard?plan=team&trial=true" : "/auth/onboard");
        }
        redirect(callbackUrl ?? "/dashboard");
    }

    const justRegistered = params.registered === "true";
    const socialError = params.error;
    const providers = getAvailableSocialProviders();

    return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--background)]">
            {justRegistered && (
                <div className="mb-4 w-full max-w-md p-3 text-sm text-(--positive) bg-(--positive)/12 rounded-md border border-(--positive)/30 text-center">
                    Account created successfully. Please sign in.
                </div>
            )}
            {socialError && (
                <Notice variant="danger" live={false} centered className="mb-4 w-full max-w-md">
                    <SocialLoginError error={socialError} />
                </Notice>
            )}
            <AuthCard callbackUrl={callbackUrl} signUpHref={signupHref} providers={providers}>
                <LoginForm callbackUrl={callbackUrl} plan={plan} trialIntent={trialIntent} />
            </AuthCard>
        </div>
    );
}
