"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addOrgMemberByEmail, changeOrgMemberRole } from "@/lib/admin/server";
import { nameOrUnresolved } from "@/lib/labels/unresolved";
import { ORG_MEMBER_ROLES, type Membership } from "@/lib/admin/types";

type OrgMembersManagerProps = {
    orgId: string;
    members: Membership[];
};

const fieldClass =
    "rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm outline-none focus:border-(--accent-2)";

export function OrgMembersManager({ orgId, members }: OrgMembersManagerProps) {
    const router = useRouter();
    const [isAdding, setIsAdding] = useState(false);
    const [pendingUserId, setPendingUserId] = useState<string | null>(null);

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
                        {ORG_MEMBER_ROLES.map((role) => (
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

            <div className="overflow-x-auto rounded-lg border border-(--card-stroke)">
                <table className="w-full text-left text-sm">
                    <thead className="bg-(--card-70) text-(--ink-muted)">
                        <tr>
                            <th className="px-4 py-3 font-medium">User</th>
                            <th className="px-4 py-3 font-medium">Role</th>
                            <th className="px-4 py-3 font-medium">Joined</th>
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
                                        aria-label={`Role for ${member.user_email ?? member.user_name ?? "member"}`}
                                        value={member.role}
                                        disabled={pendingUserId === member.user_id}
                                        onChange={(e) =>
                                            handleRoleChange(member.user_id, e.target.value)
                                        }
                                        className={fieldClass}
                                    >
                                        {!(ORG_MEMBER_ROLES as readonly string[]).includes(
                                            member.role,
                                        ) && <option value={member.role}>{member.role}</option>}
                                        {ORG_MEMBER_ROLES.map((role) => (
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
                            </tr>
                        ))}
                        {members.length === 0 && (
                            <tr>
                                <td
                                    colSpan={3}
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
