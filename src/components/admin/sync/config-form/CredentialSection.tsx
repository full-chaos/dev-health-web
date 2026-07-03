import type { ChangeEvent } from "react";
import Link from "next/link";
import type { IntegrationCredential } from "@/lib/admin/types";
import { inputClass } from "@/components/shared/BaseForm";
import { CTA_LABELS } from "@/lib/design/cta";
import { FormSection } from "./FormSection";
import { ImmutableField } from "./ImmutableField";

type CredentialSectionProps = {
    isEdit: boolean;
    credentialId: string;
    credentialName: string | null;
    filteredCredentials: IntegrationCredential[];
    onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    onOpenCreateModal: () => void;
};

/** Credential picker. Immutable once created — SyncConfigUpdate has no
 * `credential_id` field, so re-auth requires a new sync configuration. */
export function CredentialSection({
    isEdit,
    credentialId,
    credentialName,
    filteredCredentials,
    onChange,
    onOpenCreateModal,
}: CredentialSectionProps) {
    return (
        <FormSection
            title="Credential"
            description="Stored credential that authenticates this sync."
        >
            {isEdit ? (
                <ImmutableField
                    label="Credential"
                    value={credentialName ?? "None selected"}
                    note="The credential can't be changed after creation. Remove and recreate this sync configuration to use a different credential."
                />
            ) : (
                <div>
                    <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="credential_id" className="block text-sm font-medium">
                            Credential
                        </label>
                        <button
                            type="button"
                            onClick={onOpenCreateModal}
                            className="rounded-md border border-(--card-stroke) px-2 py-1 text-xs font-medium text-(--foreground) hover:bg-(--card-70)"
                        >
                            + New
                        </button>
                    </div>
                    <select
                        id="credential_id"
                        name="credential_id"
                        value={credentialId}
                        onChange={onChange}
                        className={`${inputClass} text-sm`}
                    >
                        <option value="">Select a credential...</option>
                        {filteredCredentials.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                    {filteredCredentials.length === 0 && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-amber-500">
                            <span>No credentials found for this provider.</span>
                            <Link href="/org/admin/integrations" className="underline">
                                {CTA_LABELS.addOneFirst}
                            </Link>
                            <span>or</span>
                            <button type="button" onClick={onOpenCreateModal} className="underline">
                                {CTA_LABELS.createOneNow}
                            </button>
                            <span>.</span>
                        </div>
                    )}
                </div>
            )}
        </FormSection>
    );
}
