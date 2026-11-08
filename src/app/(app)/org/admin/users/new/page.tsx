"use client";

import React, { useState } from "react";
import type { SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminNav } from "@/components/admin/AdminTabs";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BaseForm, inputClass } from "@/components/shared/BaseForm";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";
import { inviteCurrentOrgMember } from "@/lib/admin/server";
import { logger } from "@/lib/logger";

const ROLE_OPTIONS = [
    { value: "member", label: "Member" },
    { value: "admin", label: "Admin" },
    { value: "viewer", label: "Viewer" },
] as const;

export default function NewUserPage() {
    const router = useRouter();
    const { impersonationLimited } = useAdminNav();
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [role, setRole] = useState<string>("member");

    const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);

        let result: Awaited<ReturnType<typeof inviteCurrentOrgMember>>;
        try {
            result = await inviteCurrentOrgMember(email, role);
        } catch (err) {
            // A thrown server action (network, a stale action id after a deploy) never reaches
            // withErrorHandling; without this catch the invite fails with no message.
            logger.error({ err, operation: "inviteCurrentOrgMember" }, "Invite action threw");
            setIsLoading(false);
            toast.error(ACTION_FAILED_MESSAGE);
            return;
        }

        setIsLoading(false);

        if (result.error) {
            toast.error(result.error);
            return;
        }

        toast.success(`Invite sent to ${email.trim()}`);
        router.push("/org/admin/users");
        router.refresh();
    };

    return (
        <div>
            <AdminHeader
                title="Add User"
                description="Invite a person to the organization by email. They join when they accept."
            />
            <BaseForm
                onSubmitAction={handleSubmit}
                onCancelAction={() => router.push("/org/admin/users")}
                isLoading={isLoading}
                hideSubmit={impersonationLimited}
                submitLabel={isLoading ? "Sending..." : "Send invite"}
                className="max-w-2xl space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6"
                contentClassName="grid gap-6 md:grid-cols-2"
                actionsClassName="flex justify-end gap-3 pt-4"
            >
                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-(--ink-muted)">
                        Email *
                    </label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                        className={inputClass}
                        placeholder="john@example.com"
                        required
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="role" className="text-sm font-medium text-(--ink-muted)">
                        Role
                    </label>
                    <select
                        id="role"
                        name="role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        disabled={isLoading}
                        className={inputClass}
                    >
                        {ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
            </BaseForm>
        </div>
    );
}
