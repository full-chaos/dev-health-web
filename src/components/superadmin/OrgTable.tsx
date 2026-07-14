"use client";

import Link from "next/link";
import type { Organization } from "@/lib/admin/types";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";

type OrgTableProps = {
    orgs: Organization[];
};

function getTierBadge(tier: string) {
    switch (tier) {
        case "enterprise":
            return "bg-purple-500/10 text-purple-500";
        case "team":
            return "bg-blue-500/10 text-blue-500";
        default:
            return "bg-green-500/10 text-green-500";
    }
}

export function OrgTable({ orgs }: OrgTableProps) {
    const columns: DataTableColumn<Organization>[] = [
        {
            key: "name",
            header: "Name",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 font-medium text-foreground",
            render: (org) => (
                <Link href={`/superadmin/orgs/${org.id}`} className="hover:underline">
                    {org.name}
                </Link>
            ),
        },
        {
            key: "slug",
            header: "Slug",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (org) => org.slug,
        },
        {
            key: "tier",
            header: "Tier",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4",
            render: (org) => (
                <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getTierBadge(org.tier)}`}
                >
                    {org.tier}
                </span>
            ),
        },
        {
            key: "status",
            header: "Status",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4",
            render: (org) => (
                <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        org.is_active
                            ? "bg-green-500/10 text-green-500"
                            : "bg-red-500/10 text-red-500"
                    }`}
                >
                    {org.is_active ? "active" : "inactive"}
                </span>
            ),
        },
        {
            key: "created",
            header: "Created",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (org) => new Date(org.created_at).toLocaleDateString(),
        },
        {
            key: "actions",
            header: "Actions",
            headerClassName: "px-6 py-4 text-right font-medium",
            className: "px-6 py-4 text-right",
            render: (org) => (
                <Link
                    href={`/superadmin/orgs/${org.id}`}
                    className="text-(--accent) hover:underline"
                >
                    Edit
                </Link>
            ),
        },
    ];

    return (
        <DataTable
            accessibleLabel="Organizations"
            columns={columns}
            data={orgs}
            rowKeyAction={(org) => org.id}
            emptyColSpan={6}
            emptyMessage="No organizations found."
        />
    );
}
