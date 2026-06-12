"use client";

import { useState } from "react";
import Link from "next/link";
import type { User } from "@/lib/admin/types";
import { useSession } from "next-auth/react";
import { startImpersonation } from "@/lib/admin/server";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DataTable } from "@/components/shared/DataTable";
import { broadcastImpersonationEvent, openImpersonationWindow } from "@/lib/impersonation-events";

type UserTableProps = {
    users: User[];
};

export function UserTable({ users }: UserTableProps) {
    const { data: session, update } = useSession();
    const router = useRouter();
    const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

    const handleImpersonate = async (userId: string) => {
        setImpersonatingId(userId);
        // Open the impersonation tab synchronously, before any await — popup
        // blockers do not reliably honor window.open after a network
        // round-trip. Null (blocked) falls back to same-tab navigation.
        const impersonationWindow = openImpersonationWindow();
        try {
            const result = await startImpersonation(userId);
            if (result.error) {
                impersonationWindow?.close();
                toast.error(result.error);
                return;
            }
            if (result.data) {
                // Force an immediate server-verified impersonation status re-poll
                // (CHAOS-2309). The old `startImpersonation` payload is ignored by
                // the jwt callback, which left the token unaware of the active
                // impersonation for up to 30s — during that window the backend
                // already scopes data to the target org, poisoning org-keyed
                // client caches with the wrong org's data.
                await update({ impersonationChanged: true });
                broadcastImpersonationEvent({ type: "started" });
                router.refresh();
                if (impersonationWindow && !impersonationWindow.closed) {
                    impersonationWindow.location.href = "/dashboard";
                    impersonationWindow.focus();
                } else {
                    router.push("/dashboard");
                }
            } else {
                impersonationWindow?.close();
            }
        } catch {
            impersonationWindow?.close();
            toast.error("Failed to start impersonation");
        } finally {
            setImpersonatingId(null);
        }
    };

    return (
        <DataTable
            columns={[
                {
                    key: "name",
                    header: "Name / Email",
                    headerClassName: "px-6 py-4 font-medium",
                    className: "px-6 py-4 font-medium text-foreground",
                    render: (user) => (
                        <Link href={`/superadmin/users/${user.id}`} className="hover:underline">
                            <div className="font-medium">{user.full_name || "No Name"}</div>
                            <div className="text-xs text-(--ink-muted)">{user.email}</div>
                        </Link>
                    ),
                },
                {
                    key: "username",
                    header: "Username",
                    headerClassName: "px-6 py-4 font-medium",
                    className: "px-6 py-4 text-(--ink-muted)",
                    render: (user) => user.username || "-",
                },
                {
                    key: "auth",
                    header: "Auth Provider",
                    headerClassName: "px-6 py-4 font-medium",
                    className: "px-6 py-4 text-(--ink-muted)",
                    render: (user) => user.auth_provider,
                },
                {
                    key: "status",
                    header: "Status",
                    headerClassName: "px-6 py-4 font-medium",
                    className: "px-6 py-4",
                    render: (user) => (
                        <div className="flex gap-2">
                            <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    user.is_active
                                        ? "bg-green-500/10 text-green-500"
                                        : "bg-red-500/10 text-red-500"
                                }`}
                            >
                                {user.is_active ? "active" : "inactive"}
                            </span>
                            {user.is_verified && (
                                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-500">
                                    verified
                                </span>
                            )}
                        </div>
                    ),
                },
                {
                    key: "role",
                    header: "Role",
                    headerClassName: "px-6 py-4 font-medium",
                    className: "px-6 py-4",
                    render: (user) =>
                        user.is_superuser ? (
                            <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2.5 py-0.5 text-xs font-medium text-purple-500">
                                superuser
                            </span>
                        ) : null,
                },
                {
                    key: "last_login",
                    header: "Last Login",
                    headerClassName: "px-6 py-4 font-medium",
                    className: "px-6 py-4 text-(--ink-muted)",
                    render: (user) =>
                        user.last_login_at
                            ? new Date(user.last_login_at).toLocaleDateString()
                            : "-",
                },
                {
                    key: "actions",
                    header: "Actions",
                    headerClassName: "px-6 py-4 text-right font-medium",
                    className: "px-6 py-4 text-right space-x-4",
                    render: (user) => (
                        <>
                            {session?.user?.id !== user.id && !user.is_superuser && (
                                <button
                                    type="button"
                                    onClick={() => handleImpersonate(user.id)}
                                    disabled={impersonatingId === user.id}
                                    className="text-amber-500 hover:underline disabled:opacity-50"
                                >
                                    {impersonatingId === user.id
                                        ? "Impersonating..."
                                        : "Impersonate"}
                                </button>
                            )}
                            <Link
                                href={`/superadmin/users/${user.id}`}
                                className="text-(--accent) hover:underline"
                            >
                                Edit
                            </Link>
                        </>
                    ),
                },
            ]}
            data={users}
            rowKeyAction={(user) => user.id}
            emptyColSpan={7}
            emptyMessage="No users found."
        />
    );
}
