import { LoginForm } from "@/components/auth/LoginForm"

export default function SignInPage() {
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
        <div className="mt-8 bg-[var(--card)] py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-[var(--card-stroke)]">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
