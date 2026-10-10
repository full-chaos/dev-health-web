import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PlanManager } from "@/components/admin/billing/PlanManager";
import { requireSuperuser } from "@/lib/auth";
import { listBillingPlans } from "@/lib/billing/actions";
import { boundedRead } from "@/lib/serverDeadline";
import { Notice } from "@/components/ui/Notice";

export default async function BillingPlansAdminPage() {
    await requireSuperuser("/superadmin/billing/plans");

    const plansResult = await boundedRead(listBillingPlans(true), "step billing plans");
    const plans = plansResult.data ?? [];

    return (
        <div>
            <AdminHeader
                title="Billing Plans"
                description="Manage plans, prices, feature bundle assignments, and Stripe sync."
            />

            {plansResult.error && (
                <Notice variant="danger" live={false} className="mb-6">
                    Failed to load plans. {READ_FAILED_MESSAGE}
                </Notice>
            )}

            <PlanManager initialPlans={plans} />
        </div>
    );
}
