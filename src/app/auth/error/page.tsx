import Link from "next/link"

type SearchParams = Promise<{ error?: string }>

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const error = params.error

  const errorMessages: Record<string, string> = {
    Configuration: "There is a problem with the server configuration.",
    AccessDenied: "You do not have access to this resource.",
    Verification: "The verification link has expired or has already been used.",
    Default: "An authentication error occurred.",
  }

  const message = error ? errorMessages[error] || errorMessages.Default : errorMessages.Default

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--background)]">
      <div className="w-full max-w-md space-y-8 text-center">
        <div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-[var(--foreground)]">
            Authentication Error
          </h2>
          <p className="mt-4 text-sm text-[var(--ink-muted)]">
            {message}
          </p>
          {error && (
            <p className="mt-2 text-xs text-[var(--ink-muted)] font-mono">
              Error code: {error}
            </p>
          )}
        </div>
        <div className="mt-8">
          <Link
            href="/auth/signin"
            className="inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
