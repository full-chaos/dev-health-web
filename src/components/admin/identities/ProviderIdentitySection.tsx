import { inputClass } from "@/components/shared/BaseForm";
import { CTA_LABELS } from "@/lib/design/cta";
import { PROVIDERS, type ProviderEntry } from "./providerIdentityUtils";

type ProviderIdentitySectionProps = {
    entries: ProviderEntry[];
    error: string | null;
    onEntryChangeAction: (index: number, field: "provider" | "username", value: string) => void;
    onAddAction: () => void;
    onRemoveAction: (index: number) => void;
};

/**
 * Provider-identity row editor for IdentityForm (CHAOS-2841 mapping-forms
 * lane): one provider+username row per linked account, a discoverable
 * labeled remove action per row (not a bare "x"), and a blocking validation
 * banner surfaced by the parent form before submit.
 */
export function ProviderIdentitySection({
    entries,
    error,
    onEntryChangeAction,
    onAddAction,
    onRemoveAction,
}: ProviderIdentitySectionProps) {
    return (
        <div>
            <div className="mb-2 flex items-center justify-between">
                <span className="block text-sm font-medium">Provider Identities</span>
                <button
                    type="button"
                    onClick={onAddAction}
                    className="text-xs font-medium text-(--accent) hover:underline"
                >
                    {CTA_LABELS.addProviderIdentity}
                </button>
            </div>

            {error ? (
                <p role="alert" className="mb-2 text-xs text-(--negative)">
                    {error}
                </p>
            ) : null}

            <div className="space-y-3">
                {entries.map((entry, index) => (
                    <div key={entry.id} className="flex gap-3">
                        <select
                            value={entry.provider}
                            onChange={(event) =>
                                onEntryChangeAction(index, "provider", event.target.value)
                            }
                            aria-label="Provider"
                            className="w-1/3 rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                        >
                            {PROVIDERS.map((provider) => (
                                <option key={provider} value={provider}>
                                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={entry.username}
                            onChange={(event) =>
                                onEntryChangeAction(index, "username", event.target.value)
                            }
                            placeholder="Username / ID"
                            className={`${inputClass} flex-1 text-sm`}
                        />
                        <button
                            type="button"
                            onClick={() => onRemoveAction(index)}
                            aria-label={
                                entry.username
                                    ? `Remove ${entry.provider} identity ${entry.username}`
                                    : `Remove ${entry.provider} identity`
                            }
                            className="shrink-0 rounded-lg border border-(--card-stroke) px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-500/10"
                        >
                            {CTA_LABELS.remove}
                        </button>
                    </div>
                ))}
                {entries.length === 0 && (
                    <p className="text-sm italic text-(--ink-muted)">
                        No provider identities linked.
                    </p>
                )}
            </div>
        </div>
    );
}
