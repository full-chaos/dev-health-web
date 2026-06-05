import { SignupForm } from "@/components/auth/SignupForm";
import { AuthCard } from "@/components/auth/AuthCard";
import { getAvailableSocialProviders } from "@/lib/auth";

type SearchParams = Promise<{ plan?: string; trial?: string }>;

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    const plan = params.plan?.toLowerCase();
    const trialIntent = plan === "team" && params.trial === "true";
    const signInHref = trialIntent ? "/auth/signin?plan=team&trial=true" : "/auth/signin";
    const providers = getAvailableSocialProviders();

    return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--background)]">
            <AuthCard signInHref={signInHref} providers={providers}>
                <SignupForm plan={plan} trialIntent={trialIntent} />
            </AuthCard>
        </div>
    );
}
