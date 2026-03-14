import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { OnboardForm } from "@/components/auth/OnboardForm"

type SearchParams = Promise<{ plan?: string; trial?: string }>

export default async function OnboardPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const plan = params.plan?.toLowerCase()
  const trialIntent = plan === "team" && params.trial === "true"

  const session = await auth()

  if (!session?.user) {
    redirect("/auth/signin")
  }

  if (session.user.org_id && !session.user.needs_onboarding) {
    redirect(trialIntent ? "/auth/trial-checkout?plan=team&trial=true" : "/dashboard")
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[var(--background)]">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-[var(--foreground)]">
            Set up your workspace
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Create your organization to get started
          </p>
        </div>
        <div className="mt-8 bg-[var(--card)] py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-[var(--card-stroke)]">
          <OnboardForm plan={plan} trialIntent={trialIntent} />
        </div>
      </div>
    </div>
  )
}
