import { CTA_LABELS } from "@/lib/design/cta";
import type { PagerDutyServiceOption } from "@/lib/admin/pagerduty";
import { inputClass } from "@/components/shared/BaseForm";

export type PagerDutyServiceSelectorState =
    | { readonly kind: "no-credential" }
    | { readonly kind: "loading" }
    | { readonly kind: "empty" }
    | { readonly kind: "error"; readonly onRetryAction: () => void }
    | { readonly kind: "ready"; readonly services: readonly PagerDutyServiceOption[] };

type PagerDutyServiceSelectorProps = {
    readonly rowId: string;
    readonly value: string;
    readonly state: PagerDutyServiceSelectorState;
    readonly errorId: string;
    readonly isInvalid: boolean;
    readonly onChangeAction: (value: string) => void;
};

function assertNever(value: never): never {
    throw new Error(`Unhandled PagerDuty service selector state: ${JSON.stringify(value)}`);
}

function includesSelectedService(
    state: PagerDutyServiceSelectorState,
    selectedServiceId: string,
): boolean {
    if (state.kind !== "ready") return false;
    return state.services.some((service) => service.external_id === selectedServiceId);
}

function stateMessage(state: PagerDutyServiceSelectorState): string | null {
    switch (state.kind) {
        case "no-credential":
            return "Choose a PagerDuty credential to load services.";
        case "loading":
            return "Loading PagerDuty services…";
        case "empty":
            return "No PagerDuty services are available for this credential.";
        case "error":
        case "ready":
            return null;
        default:
            return assertNever(state);
    }
}

function disabled(state: PagerDutyServiceSelectorState): boolean {
    switch (state.kind) {
        case "ready":
            return false;
        case "no-credential":
        case "loading":
        case "empty":
        case "error":
            return true;
        default:
            return assertNever(state);
    }
}

export function PagerDutyServiceSelector({
    rowId,
    value,
    state,
    errorId,
    isInvalid,
    onChangeAction,
}: PagerDutyServiceSelectorProps) {
    const selectId = `pagerduty-service-${rowId}`;
    const helperId = `pagerduty-service-help-${rowId}`;
    const serviceIsUnavailable =
        state.kind === "ready" && value.length > 0 && !includesSelectedService(state, value);
    const hasSavedSelection = value.length > 0 && (state.kind !== "ready" || serviceIsUnavailable);
    const message = stateMessage(state);
    const descriptionIds = [
        isInvalid ? errorId : null,
        message || serviceIsUnavailable || state.kind === "error" ? helperId : null,
    ]
        .filter((id): id is string => id !== null)
        .join(" ");

    return (
        <div>
            <label
                htmlFor={selectId}
                className="mb-1.5 block text-sm font-medium text-(--ink-muted)"
            >
                PagerDuty service
            </label>
            <select
                id={selectId}
                value={value}
                disabled={disabled(state)}
                aria-invalid={isInvalid || undefined}
                aria-describedby={descriptionIds || undefined}
                onChange={(event) => onChangeAction(event.target.value)}
                className={`${inputClass} text-sm`}
            >
                <option key="placeholder" value="">
                    Select a PagerDuty service
                </option>
                {hasSavedSelection ? (
                    <option key="saved-service" value={value}>
                        {serviceIsUnavailable
                            ? "Unavailable service — select a replacement"
                            : "Saved service"}
                    </option>
                ) : null}
                {state.kind === "ready"
                    ? state.services.map((service) => (
                          <option key={service.external_id} value={service.external_id}>
                              {service.name_resolved
                                  ? service.display_name
                                  : "PagerDuty service (Unresolved)"}
                          </option>
                      ))
                    : null}
            </select>
            {message ? (
                <p
                    id={helperId}
                    role="status"
                    aria-busy={state.kind === "loading" || undefined}
                    className="mt-1.5 text-xs text-(--ink-muted)"
                >
                    {message}
                </p>
            ) : null}
            {serviceIsUnavailable ? (
                <div
                    id={helperId}
                    className="mt-1.5 flex items-center gap-2 text-xs text-(--ink-muted)"
                >
                    <span className="rounded-full border border-(--caution)/40 bg-(--caution)/10 px-2 py-0.5 font-medium text-(--caution)">
                        Unresolved
                    </span>
                    <span>This persisted service is no longer returned by PagerDuty.</span>
                </div>
            ) : null}
            {state.kind === "error" ? (
                <div
                    id={helperId}
                    role="status"
                    className="mt-1.5 flex items-center gap-2 text-xs text-(--caution)"
                >
                    <span>PagerDuty services could not be loaded.</span>
                    <button
                        type="button"
                        onClick={state.onRetryAction}
                        className="font-medium text-foreground underline underline-offset-2"
                    >
                        {CTA_LABELS.retry}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
