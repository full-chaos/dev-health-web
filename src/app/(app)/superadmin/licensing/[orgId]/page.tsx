import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { EntitlementsDetail } from "@/components/superadmin/EntitlementsDetail";
import {
    getOrganization,
    getOrgEntitlements,
    listFeatureOverrides,
    listFeatureFlags,
} from "@/lib/admin/server";

type PageProps = {
    params: Promise<{ orgId: string }>;
};

export default async function LicensingDetailPage({ params }: PageProps) {
    const { orgId } = await params;

    const [orgResult, entitlementsResult, overridesResult, flagsResult] = await Promise.all([
        getOrganization(orgId),
        getOrgEntitlements(orgId),
        listFeatureOverrides(orgId),
        listFeatureFlags(),
    ]);

    const org = orgResult.data;
    const entitlements = entitlementsResult.data;
    const overrides = overridesResult.data;
    const featureFlags = flagsResult.data;

    if (!org || !entitlements) {
        notFound();
    }

    return (
        <div>
            <AdminHeader
                title={`${org.name} Entitlements`}
                description={`Manage licensing and feature flags for ${org.slug}`}
            />

            <EntitlementsDetail
                orgId={org.id}
                entitlements={entitlements}
                overrides={overrides || []}
                featureFlags={featureFlags || []}
            />
        </div>
    );
}
