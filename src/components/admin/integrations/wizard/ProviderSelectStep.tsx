import { PROVIDERS, PROVIDER_LABELS, type Provider } from "@/lib/admin/types";

type ProviderSelectStepProps = {
    canCreatePagerDuty: boolean;
    provider: Provider | "";
    onChangeAction: (provider: Provider) => void;
};

/**
 * First step of the Add Provider wizard (CHAOS-2837): choose which provider
 * to connect. Skipped entirely when the wizard is launched from a specific
 * provider's detail page (see `getVisibleAddProviderSteps`'s `lockProvider`).
 */
export function ProviderSelectStep({
    canCreatePagerDuty,
    provider,
    onChangeAction,
}: ProviderSelectStepProps) {
    return (
        <div className="space-y-3">
            <div>
                <h2 className="text-sm font-semibold text-foreground">Provider</h2>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Choose the tool you want Dev Health to connect to.
                </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {PROVIDERS.filter(
                    (candidate) => candidate !== "pagerduty" || canCreatePagerDuty,
                ).map((p) => {
                    return (
                        <label
                            key={p}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                                provider === p
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                                    : "border-(--card-stroke) text-foreground hover:bg-(--card-70)"
                            }`}
                        >
                            <input
                                type="radio"
                                name="provider"
                                value={p}
                                checked={provider === p}
                                onChange={() => onChangeAction(p)}
                                className="sr-only"
                            />
                            {PROVIDER_LABELS[p]}
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
