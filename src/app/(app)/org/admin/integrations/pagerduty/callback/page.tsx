import { AdminHeader } from "@/components/admin/AdminHeader";
import { PagerDutyCallback } from "@/components/admin/integrations/PagerDutyCallback";

export default function PagerDutyCallbackPage() {
    return (
        <div className="flex flex-col gap-8">
            <AdminHeader title="PagerDuty connection" />
            <PagerDutyCallback />
        </div>
    );
}
