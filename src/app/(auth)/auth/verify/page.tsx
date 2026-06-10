import Link from "next/link";
import { getBackendUrl } from "@/lib/origin";
import { extractErrorMessage } from "@/lib/errorMessages";

type SearchParams = Promise<{ token?: string }>;

export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    const token = params.token;

    let success = false;
    let message = "Missing verification token";

    if (token) {
        try {
            const backendUrl = getBackendUrl();
            const res = await fetch(
                `${backendUrl}/api/v1/auth/verify?token=${encodeURIComponent(token)}`,
                { cache: "no-store" },
            );

            if (res.ok) {
                success = true;
                message = "Email verified successfully";
            } else {
                try {
                    const data = await res.json();
                    message = extractErrorMessage(
                        data.detail,
                        "Invalid or expired verification token",
                    );
                } catch {
                    message = "Invalid or expired verification token";
                }
            }
        } catch {
            message = "Unable to reach the server. Please try again later.";
        }
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--background)]">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-bold tracking-tight text-[var(--foreground)]">
                        Email Verification
                    </h2>
                </div>
                <div className="mt-8 bg-[var(--card)] py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-[var(--border)]">
                    {success ? (
                        <div className="space-y-6">
                            <div className="p-4 text-sm text-green-400 bg-green-950/50 rounded-md border border-green-800 text-center">
                                {message}. You can now sign in.
                            </div>
                            <Link
                                href="/auth/signin"
                                className="block w-full text-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                            >
                                Sign in
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="p-4 text-sm text-red-400 bg-red-950/50 rounded-md border border-red-800 text-center">
                                {message}
                            </div>
                            <Link
                                href="/auth/signin"
                                className="block w-full text-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                            >
                                Back to Sign in
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
