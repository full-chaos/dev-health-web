import Link from "next/link";
import type { Organization } from "@/lib/admin/types";
import { CTA_LABELS } from "@/lib/design/cta";
import { appPath } from "@/lib/navigation/appPath";

type LicenseTableProps = {
    orgs: Organization[];
};

function getTierBadge(tier: string) {
    switch (tier) {
        case "enterprise":
            return "bg-(--info)/12 text-(--info)";
        case "team":
            return "bg-(--info)/12 text-(--info)";
        default:
            return "bg-(--positive)/12 text-(--positive)";
    }
}

export function LicenseTable({ orgs }: LicenseTableProps) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
            <table className="w-full text-left text-sm">
                <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
                    <tr>
                        <th className="px-6 py-4 font-medium">Organization</th>
                        <th className="px-6 py-4 font-medium">Slug</th>
                        <th className="px-6 py-4 font-medium">Tier</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                        <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-(--card-stroke)">
                    {orgs.map((org) => (
                        <tr key={org.id} className="hover:bg-(--card-70)/50">
                            <td className="px-6 py-4 font-medium text-foreground">
                                <Link
                                    href={appPath("/superadmin/licensing/[orgId]", {
                                        orgId: org.id,
                                    })}
                                    prefetch={false}
                                    className="hover:underline"
                                >
                                    {org.name}
                                </Link>
                            </td>
                            <td className="px-6 py-4 text-(--ink-muted)">{org.slug}</td>
                            <td className="px-6 py-4">
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getTierBadge(
                                        org.tier,
                                    )}`}
                                >
                                    {org.tier}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <span
                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                        org.is_active
                                            ? "bg-(--positive)/12 text-(--positive)"
                                            : "bg-(--negative)/12 text-(--negative)"
                                    }`}
                                >
                                    {org.is_active ? "active" : "inactive"}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <Link
                                    href={appPath("/superadmin/licensing/[orgId]", {
                                        orgId: org.id,
                                    })}
                                    prefetch={false}
                                    className="text-(--accent-2) hover:underline"
                                >
                                    {CTA_LABELS.manageEntitlements}
                                </Link>
                            </td>
                        </tr>
                    ))}
                    {orgs.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-(--ink-muted)">
                                No organizations found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
