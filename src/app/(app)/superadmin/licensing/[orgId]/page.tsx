import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { EntitlementsDetail } from "@/components/superadmin/EntitlementsDetail";
import { PlatformModelFallbackCard } from "@/components/superadmin/PlatformModelFallbackCard";
import { auth } from "@/lib/auth";
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

    const [session, orgResult, entitlementsResult, overridesResult, flagsResult] =
        await Promise.all([
            auth(),
            getOrganization(orgId),
            getOrgEntitlements(orgId),
            listFeatureOverrides(orgId),
            listFeatureFlags(),
        ]);

    const org = orgResult.data;
    const entitlements = entitlementsResult.data;
    const overrides = overridesResult.data;
    const featureFlags = flagsResult.data;
    const featureCatalogUnavailable = Boolean(flagsResult.error || !featureFlags);

    if (!org || !entitlements) {
        notFound();
    }

    return (
        <div>
            <AdminHeader
                title={`${org.name} Entitlements`}
                description={`Manage licensing and feature flags for ${org.slug}`}
            />

            <div className="mb-8">
                <PlatformModelFallbackCard
                    orgId={org.id}
                    granted={entitlements.features.platform_model_fallback === true}
                    isPlatformAdmin={session?.user?.is_superuser === true}
                />
            </div>

            <EntitlementsDetail
                orgId={org.id}
                entitlements={entitlements}
                overrides={overrides || []}
                featureFlags={featureFlags || []}
                featureCatalogUnavailable={featureCatalogUnavailable}
            />
        </div>
    );
}
