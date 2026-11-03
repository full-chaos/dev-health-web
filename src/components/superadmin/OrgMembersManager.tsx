"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    addOrgMemberByEmail,
    changeOrgMemberRole,
    inviteOrgMember,
    removeOrgMember,
    transferOrgOwnership,
} from "@/lib/admin/server";
import { CTA_LABELS } from "@/lib/design/cta";
import { nameOrUnresolved } from "@/lib/labels/unresolved";
import { USER_CREATE_ROLES, type Membership } from "@/lib/admin/types";

type OrgMembersManagerProps = {
    orgId: string;
    members: Membership[];
};

type ConfirmStep = { userId: string; kind: "remove" | "owner" };

const buttonClass =
    "rounded-lg border border-(--card-stroke) px-3 py-1.5 text-xs font-medium hover:bg-(--card-70) disabled:opacity-50";

const fieldClass =
    "rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent-2)";

const label = (member: Membership) => member.user_email ?? member.user_name ?? "member";

export function OrgMembersManager({ orgId, members }: OrgMembersManagerProps) {
    const router = useRouter();
    const [isAdding, setIsAdding] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [pendingUserId, setPendingUserId] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<ConfirmStep | null>(null);

    async function handleAdd(formData: FormData) {
        setIsAdding(true);
        const result = await addOrgMemberByEmail(
            orgId,
            String(formData.get("email") ?? ""),
            String(formData.get("role") ?? "member"),
        );
        setIsAdding(false);
        if (result.error) {
            toast.error(result.error);
            return;
        }
        toast.success("Member added");
        (document.getElementById("add-member-form") as HTMLFormElement | null)?.reset();
        router.refresh();
    }

    async function handleRoleChange(userId: string, role: string) {
        setPendingUserId(userId);
        const result = await changeOrgMemberRole(orgId, userId, role);
        setPendingUserId(null);
        if (result.error) {
            toast.error(result.error);
            return;
        }
        toast.success("Role updated");
        router.refresh();
    }

    async function handleInvite(formData: FormData) {
        setIsInviting(true);
        const result = await inviteOrgMember(
            orgId,
            String(formData.get("email") ?? ""),
            String(formData.get("role") ?? "member"),
        );
        setIsInviting(false);
        if (result.error) {
            toast.error(result.error);
            return;
        }
        toast.success("Invite sent");
        (document.getElementById("invite-member-form") as HTMLFormElement | null)?.reset();
        router.refresh();
    }

    async function handleConfirmed(step: ConfirmStep) {
        setConfirm(null);
        setPendingUserId(step.userId);
        const result =
            step.kind === "remove"
                ? await removeOrgMember(orgId, step.userId)
                : await transferOrgOwnership(orgId, step.userId);
        setPendingUserId(null);
        if (result.error) {
            toast.error(result.error);
            return;
        }
        toast.success(step.kind === "remove" ? "Member removed" : "Owner changed");
        router.refresh();
    }

    return (
        <div className="space-y-6">
            <form
                id="add-member-form"
                action={handleAdd}
                className="flex flex-wrap items-end gap-4"
            >
                <div className="space-y-2">
                    <label htmlFor="member-email" className="block text-sm font-medium">
                        Member email
                    </label>
                    <input
                        id="member-email"
                        name="email"
                        type="email"
                        required
                        className={`${fieldClass} w-72`}
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="member-role" className="block text-sm font-medium">
                        Role
                    </label>
                    <select
                        id="member-role"
                        name="role"
                        defaultValue="member"
                        className={fieldClass}
                    >
                        {USER_CREATE_ROLES.map((role) => (
                            <option key={role} value={role}>
                                {role}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="submit"
                    disabled={isAdding}
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                    {isAdding ? "Adding..." : "Add member"}
                </button>
            </form>

            <form
                id="invite-member-form"
                action={handleInvite}
                className="flex flex-wrap items-end gap-4"
            >
                <div className="space-y-2">
                    <label htmlFor="invite-email" className="block text-sm font-medium">
                        Invite email
                    </label>
                    <input
                        id="invite-email"
                        name="email"
                        type="email"
                        required
                        className={`${fieldClass} w-72`}
                    />
                </div>
                <div className="space-y-2">
                    <label htmlFor="invite-role" className="block text-sm font-medium">
                        Invite role
                    </label>
                    <select
                        id="invite-role"
                        name="role"
                        defaultValue="member"
                        className={fieldClass}
                    >
                        {USER_CREATE_ROLES.map((role) => (
                            <option key={role} value={role}>
                                {role}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    type="submit"
                    disabled={isInviting}
                    className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium hover:bg-(--card-70) disabled:opacity-50"
                >
                    {isInviting ? "Sending..." : "Send invite"}
                </button>
            </form>

            <div className="overflow-x-auto rounded-lg border border-(--card-stroke)">
                <table className="w-full text-left text-sm">
                    <thead className="bg-(--card-70) text-(--ink-muted)">
                        <tr>
                            <th className="px-4 py-3 font-medium">User</th>
                            <th className="px-4 py-3 font-medium">Role</th>
                            <th className="px-4 py-3 font-medium">Joined</th>
                            <th className="px-4 py-3 font-medium">
                                <span className="sr-only">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-(--card-stroke)">
                        {members.map((member) => (
                            <tr key={member.id}>
                                <td className="px-4 py-3">
                                    <span>{nameOrUnresolved(member.user_name)}</span>
                                    {member.user_email ? (
                                        <span className="block text-xs text-(--ink-muted)">
                                            {member.user_email}
                                        </span>
                                    ) : null}
                                </td>
                                <td className="px-4 py-3">
                                    <select
                                        aria-label={`Role for ${label(member)}`}
                                        value={member.role}
                                        disabled={pendingUserId === member.user_id}
                                        onChange={(e) =>
                                            handleRoleChange(member.user_id, e.target.value)
                                        }
                                        className={fieldClass}
                                    >
                                        {!(USER_CREATE_ROLES as readonly string[]).includes(
                                            member.role,
                                        ) && <option value={member.role}>{member.role}</option>}
                                        {USER_CREATE_ROLES.map((role) => (
                                            <option key={role} value={role}>
                                                {role}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td className="px-4 py-3 text-(--ink-muted)">
                                    {member.joined_at
                                        ? new Date(member.joined_at).toLocaleDateString()
                                        : "-"}
                                </td>
                                <td className="px-4 py-3">
                                    {confirm?.userId === member.user_id ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={pendingUserId === member.user_id}
                                                aria-label={
                                                    confirm.kind === "remove"
                                                        ? `Confirm remove ${label(member)}`
                                                        : `Confirm owner change to ${label(member)}`
                                                }
                                                onClick={() => handleConfirmed(confirm)}
                                            >
                                                {confirm.kind === "remove"
                                                    ? "Confirm remove"
                                                    : "Confirm owner change"}
                                            </button>
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                onClick={() => setConfirm(null)}
                                            >
                                                {CTA_LABELS.cancel}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap items-center gap-2">
                                            {member.role !== "owner" && (
                                                <button
                                                    type="button"
                                                    className={buttonClass}
                                                    disabled={pendingUserId === member.user_id}
                                                    aria-label={`Make ${label(member)} the owner`}
                                                    onClick={() =>
                                                        setConfirm({
                                                            userId: member.user_id,
                                                            kind: "owner",
                                                        })
                                                    }
                                                >
                                                    {CTA_LABELS.makeOwner}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className={buttonClass}
                                                disabled={pendingUserId === member.user_id}
                                                aria-label={`Remove ${label(member)}`}
                                                onClick={() =>
                                                    setConfirm({
                                                        userId: member.user_id,
                                                        kind: "remove",
                                                    })
                                                }
                                            >
                                                {CTA_LABELS.remove}
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {members.length === 0 && (
                            <tr>
                                <td
                                    colSpan={4}
                                    className="px-4 py-8 text-center text-(--ink-muted)"
                                >
                                    No members found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
