"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { User } from "@/lib/admin/types";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatDateUTC } from "@/lib/formatters";

export type { User };

type UserTableProps = {
    users: User[];
};

function getStatusDisplay(user: User): { label: string; className: string } {
    if (!user.is_active) {
        return { label: "inactive", className: "bg-red-500/10 text-red-500" };
    }
    if (!user.is_verified) {
        return { label: "pending", className: "bg-yellow-500/10 text-yellow-500" };
    }
    return { label: "active", className: "bg-green-500/10 text-green-500" };
}

function includesSearch(value: string | null | undefined, query: string): boolean {
    return value?.toLowerCase().includes(query) ?? false;
}

function userMatchesSearch(user: User, query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return true;
    }

    const status = getStatusDisplay(user).label;
    return (
        includesSearch(user.full_name, normalizedQuery) ||
        includesSearch(user.email, normalizedQuery) ||
        includesSearch(user.username, normalizedQuery) ||
        includesSearch(status, normalizedQuery) ||
        includesSearch(user.auth_provider, normalizedQuery)
    );
}

export function UserTable({ users }: UserTableProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const filteredUsers = useMemo(
        () => users.filter((user) => userMatchesSearch(user, searchQuery)),
        [users, searchQuery],
    );
    const columns: DataTableColumn<User>[] = [
        {
            key: "name",
            header: "Name",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 font-medium text-foreground",
            render: (user) => (
                <Link href={`/org/admin/users/${user.id}`} className="hover:underline">
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
            render: (user) => (user.last_login_at ? formatDateUTC(user.last_login_at) : "Never"),
        },
        {
            key: "actions",
            header: "Actions",
            headerClassName: "px-6 py-4 text-right font-medium",
            className: "px-6 py-4 text-right",
            render: (user) => (
                <Link
                    href={`/org/admin/users/${user.id}/edit`}
                    className="text-(--accent) hover:underline"
                >
                    {CTA_LABELS.edit}
                </Link>
            ),
        },
    ];

    return (
        <DataTable
            accessibleLabel="Users"
            columns={columns}
            data={filteredUsers}
            rowKeyAction={(user) => user.id}
            emptyColSpan={6}
            emptyMessage={users.length === 0 ? "No users found." : "No users match your search."}
            search={{
                value: searchQuery,
                placeholder: "Search users",
                buttonLabel: CTA_LABELS.applyFilters,
            }}
            onSearchAction={setSearchQuery}
            onSearchChangeAction={setSearchQuery}
        />
    );
}
