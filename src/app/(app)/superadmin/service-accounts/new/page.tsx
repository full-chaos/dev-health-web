"use client";

import React, { useEffect, useState, type ChangeEvent, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BaseForm, inputClass, useBaseFormState } from "@/components/shared/BaseForm";
import { Notice } from "@/components/ui/Notice";
import { createServiceAccount, listOrganizations, listOrgMembers } from "@/lib/admin/server";
import type { Membership, Organization } from "@/lib/admin/types";
import { SERVICE_ACCOUNT_NAME_MAX, validateServiceAccountName } from "@/lib/admin/serviceAccount";
import { CTA_LABELS } from "@/lib/design/cta";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";

type Created = { id: string };

export default function NewServiceAccountPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const [created, setCreated] = useState<Created | null>(null);
    const [touched, setTouched] = useState(false);
    const { formData, setFormData, handleChange } = useBaseFormState({
        name: "",
        organization_id: "",
        owner_principal_id: "",
    });
    const [orgs, setOrgs] = useState<Organization[]>([]);
    const [members, setMembers] = useState<Membership[]>([]);

    useEffect(() => {
        let live = true;
        void listOrganizations().then((result) => {
            if (!live) return;
            if (result.error || !result.data) setFailure(result.error ?? ACTION_FAILED_MESSAGE);
            else setOrgs(result.data.filter((org) => org.is_active));
        });
        return () => {
            live = false;
        };
    }, []);

    useEffect(() => {
        if (!formData.organization_id) return;
        let live = true;
        void listOrgMembers(formData.organization_id).then((result) => {
            if (!live) return;
            if (result.error || !result.data) setFailure(result.error ?? ACTION_FAILED_MESSAGE);
            else setMembers(result.data);
        });
        return () => {
            live = false;
        };
    }, [formData.organization_id]);

    const handleOrgChange = (event: ChangeEvent<HTMLSelectElement>) => {
        setMembers([]);
        setFormData((prev) => ({
            ...prev,
            organization_id: event.target.value,
            owner_principal_id: "",
        }));
    };

    const orgProblem = formData.organization_id ? null : "Choose an organization.";
    const ownerProblem = formData.owner_principal_id ? null : "Choose an owner.";
    const shownOrgProblem = touched ? orgProblem : null;
    const shownOwnerProblem = touched ? ownerProblem : null;

    const problem = validateServiceAccountName(formData.name);
    const shownProblem = touched ? problem : null;

    const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
        setTouched(true);
        setFailure(null);
        if (problem || orgProblem || ownerProblem) return;
        setIsLoading(true);
        try {
            const result = await createServiceAccount({
                name: formData.name,
                organization_id: formData.organization_id,
                owner_principal_id: formData.owner_principal_id,
            });
            if (result.error || !result.data) {
                setFailure(result.error ?? ACTION_FAILED_MESSAGE);
                return;
            }
            setCreated({ id: result.data.service_account_id });
            router.refresh();
        } catch {
            setFailure(ACTION_FAILED_MESSAGE);
        } finally {
            setIsLoading(false);
        }
    };

    if (created) {
        return (
            <div className="max-w-2xl">
                <AdminHeader title="Service account created" />
                <div className="mt-4 space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <dl className="grid gap-3 text-sm md:grid-cols-[8rem_1fr]">
                        <dt className="text-(--ink-muted)">ID</dt>
                        <dd className="break-all text-foreground">{created.id}</dd>
                    </dl>
                    <Notice variant="info" live={false}>
                        A token for this account is issued by an operator. This page cannot show
                        one.
                    </Notice>
                    <div className="flex gap-3">
                        <Link
                            href="/superadmin/users"
                            className="inline-flex items-center rounded-xl bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
                        >
                            {CTA_LABELS.backToUsers}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl">
            <AdminHeader
                title="Create service account"
                description="A service account is for a system, not a person."
            />
            <BaseForm
                onSubmitAction={handleSubmit}
                onCancelAction={() => router.push("/superadmin/users")}
                isLoading={isLoading}
                submitDisabled={Boolean(orgProblem || ownerProblem)}
                submitLabel={isLoading ? "Creating..." : "Create service account"}
                className="mt-4 max-w-2xl space-y-6 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6"
                contentClassName="grid gap-6"
                actionsClassName="flex justify-end gap-3 pt-4"
            >
                {failure ? <Notice variant="danger">{failure}</Notice> : null}
                <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium text-(--ink-muted)">
                        Name *
                    </label>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        value={formData.name}
                        onChange={handleChange}
                        onBlur={() => setTouched(true)}
                        disabled={isLoading}
                        maxLength={SERVICE_ACCOUNT_NAME_MAX}
                        className={inputClass}
                        placeholder="ci-reporter"
                        autoComplete="off"
                        aria-invalid={shownProblem ? true : undefined}
                        aria-describedby={shownProblem ? "name-help" : undefined}
                    />
                    {shownProblem ? (
                        <p id="name-help" className="text-xs text-(--negative)">
                            {shownProblem}
                        </p>
                    ) : null}
                </div>
                <div className="space-y-2">
                    <label
                        htmlFor="organization_id"
                        className="text-sm font-medium text-(--ink-muted)"
                    >
                        Organization *
                    </label>
                    <select
                        id="organization_id"
                        name="organization_id"
                        value={formData.organization_id}
                        onChange={handleOrgChange}
                        onBlur={() => setTouched(true)}
                        disabled={isLoading}
                        className={inputClass}
                        aria-invalid={shownOrgProblem ? true : undefined}
                        aria-describedby="organization-help"
                    >
                        <option value="" />
                        {orgs.map((org) => (
                            <option key={org.id} value={org.id}>
                                {org.name}
                            </option>
                        ))}
                    </select>
                    {shownOrgProblem ? (
                        <p id="organization-help" className="text-xs text-(--negative)">
                            {shownOrgProblem}
                        </p>
                    ) : null}
                </div>
                <div className="space-y-2">
                    <label
                        htmlFor="owner_principal_id"
                        className="text-sm font-medium text-(--ink-muted)"
                    >
                        Owner *
                    </label>
                    <select
                        id="owner_principal_id"
                        name="owner_principal_id"
                        value={formData.owner_principal_id}
                        onChange={handleChange}
                        onBlur={() => setTouched(true)}
                        disabled={isLoading}
                        className={inputClass}
                        aria-invalid={shownOwnerProblem ? true : undefined}
                        aria-describedby="owner-help"
                    >
                        <option value="" />
                        {members
                            .filter((m) => m.user_name || m.user_email)
                            .map((m) => (
                                <option key={m.user_id} value={m.user_id}>
                                    {m.user_name || m.user_email}
                                </option>
                            ))}
                    </select>
                    {shownOwnerProblem ? (
                        <p id="owner-help" className="text-xs text-(--negative)">
                            {shownOwnerProblem}
                        </p>
                    ) : null}
                </div>
            </BaseForm>
        </div>
    );
}
