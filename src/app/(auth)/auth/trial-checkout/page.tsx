import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { startTrialCheckout } from "@/lib/billing/actions";

type SearchParams = Promise<{ plan?: string; trial?: string }>;

export default async function TrialCheckoutPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const params = await searchParams;
  const isTrialIntent = params.plan?.toLowerCase() === "team" && params.trial === "true";

  if (!isTrialIntent) {
    redirect("/dashboard");
  }

  const checkout = await startTrialCheckout();
  if (checkout.error || !checkout.data?.url) {
    redirect("/dashboard?trial=checkout_failed");
  }

  redirect(checkout.data.url);
}
