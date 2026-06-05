import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = {
    title: "Forgot Password | Full Chaos Dev Health",
    description: "Reset your dev-health password",
};

export default function ForgotPasswordPage() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--background)]">
            <div className="w-full max-w-md space-y-8">
                <div>
                    <h2 className="mt-6 text-3xl font-bold tracking-tight text-[var(--foreground)]">
                        Forgot your password?
                    </h2>
                    <p className="mt-2 text-sm text-[var(--ink-muted)]">
                        Enter your email and we&apos;ll send you a reset link
                    </p>
                </div>

                <div className="mt-8 bg-[var(--card)] py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-[var(--card-stroke)]">
                    <ForgotPasswordForm />
                </div>
            </div>
        </div>
    );
}
