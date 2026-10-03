"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleSlash, Clock } from "lucide-react";
import type { User } from "@/lib/admin/types";
import { StatusPill, type StatusPillProps } from "@/components/admin/StatusPill";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatDateUTC } from "@/lib/formatters";

export type { User };

type UserTableProps = {
    users: User[];
};

function getStatusDisplay(user: User): {
    label: string;
    tone: StatusPillProps["tone"];
    icon: StatusPillProps["icon"];
} {
    if (!user.is_active) return { label: "Inactive", tone: "negative", icon: CircleSlash };
    // `is_verified` is false from creation until the e-mail is verified (ops email_verification.py:111
    // sets it true); there is no invitation record, so the served word "pending" stays (sentence case).
    if (!user.is_verified) return { label: "Pending", tone: "caution", icon: Clock };
    return { label: "Active", tone: "positive", icon: CircleCheck };
}

function includesSearch(value: string | null | undefined, query: string): boolean {
    return value?.toLowerCase().includes(query) ?? false;
}

function userMatchesSearch(user: User, query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
        return true;
    }

    const status = getStatusDisplay(user).label.toLowerCase();
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
            render: (user) => <StatusPill tone="outline">{user.auth_provider}</StatusPill>,
        },
        {
            key: "status",
            header: "Status",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4",
            render: (user) => {
                const status = getStatusDisplay(user);
                return (
                    <StatusPill tone={status.tone} icon={status.icon}>
                        {status.label}
                    </StatusPill>
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
                    className="text-(--accent-2) hover:underline"
                >
                    {CTA_LABELS.edit}
                </Link>
            ),
        },
    ];

    const countNote =
        filteredUsers.length === users.length
            ? `${users.length} ${users.length === 1 ? "user" : "users"}`
            : `${filteredUsers.length} of ${users.length} users`;

    return (
        <Section title="Users">
            <DataTable
                accessibleLabel="Users"
                columns={columns}
                data={filteredUsers}
                rowKeyAction={(user) => user.id}
                emptyColSpan={6}
                emptyMessage={
                    users.length === 0 ? "No users found." : "No users match your search."
                }
                search={{
                    value: searchQuery,
                    placeholder: "Search users",
                    buttonLabel: CTA_LABELS.applyFilters,
                }}
                onSearchAction={setSearchQuery}
                onSearchChangeAction={setSearchQuery}
                footerNote={countNote}
            />
        </Section>
    );
}
