"use client";

import Link from "next/link";
import type { User } from "@/lib/admin/types";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";

export type { User };

type UserTableProps = {
    users: User[];
};

function getStatusDisplay(user: User): { label: string; className: string } {
    if (!user.is_active) {
        return { label: "inactive", className: "bg-red-500/10 text-red-500" };
    }
    if (!user.is_verified) {
        return { label: "invited", className: "bg-yellow-500/10 text-yellow-500" };
    }
    return { label: "active", className: "bg-green-500/10 text-green-500" };
}

export function UserTable({ users }: UserTableProps) {
    const columns: DataTableColumn<User>[] = [
        {
            key: "name",
            header: "Name",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 font-medium text-foreground",
            render: (user) => (
                <Link href={`/admin/users/${user.id}`} className="hover:underline">
                    {user.full_name || user.username || "N/A"}
                </Link>
            ),
        },
        {
            key: "email",
            header: "Email",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (user) => user.email,
        },
        {
            key: "auth",
            header: "Auth",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4",
            render: (user) => (
                <span className="inline-flex items-center rounded-full bg-(--accent)/10 px-2.5 py-0.5 text-xs font-medium text-(--accent)">
                    {user.auth_provider}
                </span>
            ),
        },
        {
            key: "status",
            header: "Status",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4",
            render: (user) => {
                const status = getStatusDisplay(user);
                return (
                    <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                    >
                        {status.label}
                    </span>
                );
            },
        },
        {
            key: "last_login",
            header: "Last Login",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (user) =>
                user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "Never",
        },
        {
            key: "actions",
            header: "Actions",
            headerClassName: "px-6 py-4 text-right font-medium",
            className: "px-6 py-4 text-right",
            render: (user) => (
                <Link
                    href={`/admin/users/${user.id}/edit`}
                    className="text-(--accent) hover:underline"
                >
                    Edit
                </Link>
            ),
        },
    ];

    return (
        <DataTable
            columns={columns}
            data={users}
            rowKeyAction={(user) => user.id}
            emptyColSpan={6}
            emptyMessage="No users found."
        />
    );
}
