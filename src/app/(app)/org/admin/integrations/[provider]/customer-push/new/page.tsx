import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BackLink } from "@/components/shared/BackLink";
import { CreateCustomerPushSourceForm } from "@/components/admin/integrations/customer-push/CreateCustomerPushSourceForm";

const PROVIDER_NAMES: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
    custom: "Custom",
};

export default async function NewCustomerPushSourcePage({
    params,
}: {
    params: Promise<{ provider: string }>;
}) {
    const { provider } = await params;
    const providerName = PROVIDER_NAMES[provider];

    if (!providerName) {
        notFound();
    }

    return (
        <div className="space-y-6">
            <BackLink href={`/org/admin/integrations/${provider}`} area="Integrations" />

            <AdminHeader
                title={`Create ${providerName} customer-push source`}
                description="Register a source instance that will push data instead of granting FullChaos provider credentials."
            />

            <CreateCustomerPushSourceForm provider={provider} providerName={providerName} />
        </div>
    );
}
