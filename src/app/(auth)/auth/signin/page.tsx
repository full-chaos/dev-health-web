import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { LoginForm } from "@/components/auth/LoginForm"

type SearchParams = Promise<{ registered?: string }>

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const session = await auth()
  if (session?.user) {
    if (session.user.needs_onboarding) {
      redirect("/auth/onboard")
    }
    redirect("/")
  }

  const params = await searchParams
  const justRegistered = params.registered === "true"

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--background)]">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-[var(--foreground)]">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Access your Dev Health dashboard
          </p>
        </div>
        {justRegistered && (
          <div className="p-3 text-sm text-green-400 bg-green-950/50 rounded-md border border-green-800 text-center">
            Account created successfully. Please sign in.
          </div>
        )}
        <div className="mt-8 bg-[var(--card)] py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-[var(--card-stroke)]">
          <LoginForm />
          <p className="mt-4 text-center text-sm text-[var(--ink-muted)]">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-[var(--accent)] hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
