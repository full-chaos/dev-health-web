"use client";

import React, { useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { BaseForm, inputClass, useBaseFormState } from "@/components/shared/BaseForm";
import { Notice } from "@/components/ui/Notice";
import { createServiceAccount } from "@/lib/admin/server";
import {
    SERVICE_ACCOUNT_DOMAIN,
    SERVICE_ACCOUNT_NAME_MAX,
    serviceAccountEmail,
    validateServiceAccountName,
} from "@/lib/admin/serviceAccount";
import { CTA_LABELS } from "@/lib/design/cta";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";

type Created = { id: string; email: string };

export default function NewServiceAccountPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const [created, setCreated] = useState<Created | null>(null);
    const [touched, setTouched] = useState(false);
    const { formData, handleChange } = useBaseFormState({ name: "", description: "" });

    const problem = validateServiceAccountName(formData.name);
    const shownProblem = touched ? problem : null;

    const handleSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
        event.preventDefault();
        setTouched(true);
        setFailure(null);
        if (problem) return;
        setIsLoading(true);
        try {
            const result = await createServiceAccount({
                name: formData.name,
                description: formData.description,
            });
            if (result.error || !result.data) {
                setFailure(result.error ?? ACTION_FAILED_MESSAGE);
                return;
            }
            setCreated({ id: result.data.id, email: result.data.email });
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
                <AdminHeader
                    title="Service account created"
                    description="The account is listed under Users."
                />
                <div className="mt-4 space-y-4 rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <dl className="grid gap-3 text-sm md:grid-cols-[8rem_1fr]">
                        <dt className="text-(--ink-muted)">Address</dt>
                        <dd className="break-all font-medium text-foreground">{created.email}</dd>
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
                description="A service account is for a system, not a person. It has no password and is not added to any organization."
            />
            <BaseForm
                onSubmitAction={handleSubmit}
                onCancelAction={() => router.push("/superadmin/users")}
                isLoading={isLoading}
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
                        aria-describedby="name-help"
                    />
                    <p
                        id="name-help"
                        className={`text-xs ${shownProblem ? "text-(--negative)" : "text-(--ink-muted)"}`}
                    >
                        {shownProblem ??
                            `The address will be ${problem ? `<name>@${SERVICE_ACCOUNT_DOMAIN}` : serviceAccountEmail(formData.name)}`}
                    </p>
                </div>
                <div className="space-y-2">
                    <label htmlFor="description" className="text-sm font-medium text-(--ink-muted)">
                        Description
                    </label>
                    <input
                        id="description"
                        name="description"
                        type="text"
                        value={formData.description}
                        onChange={handleChange}
                        disabled={isLoading}
                        className={inputClass}
                        placeholder="What uses this account"
                    />
                </div>
            </BaseForm>
        </div>
    );
}
