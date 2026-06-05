import { notFound } from "next/navigation";

import { RefundDialog } from "@/components/admin/billing/RefundDialog";
import { publicEnv } from "@/lib/config";

export default function BillingRefundsTestPage() {
    const isTestMode =
        publicEnv.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "1" ||
        publicEnv.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";
    if (!isTestMode) {
        notFound();
    }

    return (
        <main className="mx-auto max-w-3xl p-8">
            <h1 className="mb-4 text-2xl font-semibold">Refund Dialog Test Page</h1>
            <RefundDialog
                invoiceId="00000000-0000-0000-0000-000000000001"
                invoiceAmountCents={1200}
                refundableAmountCents={1200}
            />
        </main>
    );
}
