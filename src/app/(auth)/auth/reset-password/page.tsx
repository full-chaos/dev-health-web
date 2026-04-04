import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

type SearchParams = Promise<{ token?: string }>;

export const metadata = {
  title: "Reset Password | Full Chaos Dev Health",
  description: "Set a new dev-health password",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = params.token;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--background)]">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-[var(--foreground)]">
            Reset your password
          </h2>
        </div>
        
        <div className="mt-8 bg-[var(--card)] py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-[var(--card-stroke)]">
          {!token ? (
            <div className="space-y-6">
              <div className="p-4 text-sm text-red-400 bg-red-950/50 rounded-md border border-red-800 text-center">
                Missing reset token
              </div>
              <div className="text-center">
                <Link href="/auth/signin" className="text-sm font-medium text-[var(--accent)] hover:underline">
                  Back to Sign in
                </Link>
              </div>
            </div>
          ) : (
            <ResetPasswordForm token={token} />
          )}
        </div>
      </div>
    </div>
  );
}
