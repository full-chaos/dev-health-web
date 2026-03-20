import { redirect } from "next/navigation"
import { auth, getAvailableSocialProviders } from "@/lib/auth"
import { LoginForm } from "@/components/auth/LoginForm"
import { AuthCard } from "@/components/auth/AuthCard"
import { SocialLoginError } from "@/components/auth/SocialLoginError"

type SearchParams = Promise<{ registered?: string; plan?: string; trial?: string; error?: string }>

export default async function SignInPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const plan = params.plan?.toLowerCase()
  const trialIntent = plan === "team" && params.trial === "true"
  const signupHref = trialIntent ? "/auth/signup?plan=team&trial=true" : "/auth/signup"

  const session = await auth()
  if (session?.user) {
    if (session.user.needs_onboarding) {
      redirect(trialIntent ? "/auth/onboard?plan=team&trial=true" : "/auth/onboard")
    }
    redirect("/dashboard")
  }

  const justRegistered = params.registered === "true"
  const socialError = params.error
  const providers = getAvailableSocialProviders()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--background)]">
      {justRegistered && (
        <div className="mb-4 w-full max-w-md p-3 text-sm text-green-400 bg-green-950/50 rounded-md border border-green-800 text-center">
          Account created successfully. Please sign in.
        </div>
      )}
      {socialError && (
        <div className="mb-4 w-full max-w-md p-3 text-sm text-red-400 bg-red-950/50 rounded-md border border-red-800 text-center">
          <SocialLoginError error={socialError} />
        </div>
      )}
      <AuthCard signUpHref={signupHref} providers={providers}>
        <LoginForm plan={plan} trialIntent={trialIntent} />
      </AuthCard>
    </div>
  )
}
