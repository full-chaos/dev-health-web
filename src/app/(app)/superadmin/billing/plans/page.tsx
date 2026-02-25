import { AdminHeader } from "@/components/admin/AdminHeader";
import { PlanManager } from "@/components/admin/billing/PlanManager";
import { requireSuperuser } from "@/lib/auth";
import { listBillingPlans } from "@/lib/billing/actions";

export default async function BillingPlansAdminPage() {
  await requireSuperuser("/superadmin/billing/plans");

  const plansResult = await listBillingPlans(true);
  const plans = plansResult.data ?? [];

  return (
    <div>
      <AdminHeader
        title="Billing Plans"
        description="Manage plans, prices, feature bundle assignments, and Stripe sync."
      />

      {plansResult.error && (
        <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-500">
          Failed to load plans: {plansResult.error}
        </div>
      )}

      <PlanManager initialPlans={plans} />
    </div>
  );
}
