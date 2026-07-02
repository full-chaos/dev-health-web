import type { ChangeEvent } from "react";
import { PROVIDERS, PROVIDER_LABELS, type Provider } from "@/lib/admin/types";
import { inputClass } from "@/components/shared/BaseForm";
import { FormSection } from "./FormSection";
import { ImmutableField } from "./ImmutableField";

type IdentitySectionProps = {
    isEdit: boolean;
    name: string;
    provider: string;
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
};

/** Configuration name + provider. Both are immutable once created (the
 * update API never accepts `name`/`provider` — see SyncConfigUpdate). */
export function IdentitySection({ isEdit, name, provider, onChange }: IdentitySectionProps) {
    return (
        <FormSection title="Identity" description="Name and provider that identify this sync.">
            {isEdit ? (
                <ImmutableField
                    label="Configuration Name"
                    value={name}
                    note="The name can't be changed after creation."
                />
            ) : (
                <div>
                    <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                        Configuration Name
                    </label>
                    <input
                        type="text"
                        id="name"
                        name="name"
                        value={name}
                        onChange={onChange}
                        required
                        className={`${inputClass} text-sm`}
                        placeholder="e.g., GitHub Main Org Sync"
                    />
                </div>
            )}

            {isEdit ? (
                <ImmutableField
                    label="Provider"
                    value={PROVIDER_LABELS[provider as Provider] ?? provider}
                    note="The provider can't be changed after creation — create a new sync configuration to connect a different provider."
                />
            ) : (
                <div>
                    <label htmlFor="provider" className="mb-1.5 block text-sm font-medium">
                        Provider
                    </label>
                    <select
                        id="provider"
                        name="provider"
                        value={provider}
                        onChange={onChange}
                        className={`${inputClass} text-sm`}
                    >
                        {PROVIDERS.map((p) => (
                            <option key={p} value={p}>
                                {PROVIDER_LABELS[p]}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </FormSection>
    );
}
