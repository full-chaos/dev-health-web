import { inputClass } from "@/components/shared/BaseForm";
import { CTA_LABELS } from "@/lib/design/cta";
import type { EditableServiceMapping } from "./pagerDutyMappingRows";
import {
    PagerDutyServiceSelector,
    type PagerDutyServiceSelectorState,
} from "./PagerDutyServiceSelector";

type PagerDutyMappingRowProps = {
    readonly row: EditableServiceMapping;
    readonly mappingIndex: number;
    readonly isInvalid: boolean;
    readonly errorId: string;
    readonly serviceSelectorState: PagerDutyServiceSelectorState;
    readonly onServiceChangeAction: (value: string) => void;
    readonly onRepositoryChangeAction: (
        repositoryId: string,
        field: "provider" | "fullName",
        value: string,
    ) => void;
    readonly onRemoveRepositoryAction: (repositoryId: string) => void;
    readonly onAddRepositoryAction: () => void;
    readonly onRemoveMappingAction: () => void;
};

export function PagerDutyMappingRow({
    row,
    mappingIndex,
    isInvalid,
    errorId,
    serviceSelectorState,
    onServiceChangeAction,
    onRepositoryChangeAction,
    onRemoveRepositoryAction,
    onAddRepositoryAction,
    onRemoveMappingAction,
}: PagerDutyMappingRowProps) {
    const number = mappingIndex + 1;

    return (
        <fieldset className="relative space-y-3 rounded-lg border border-(--card-stroke) bg-(--card-70) p-3">
            <legend className="sm:pr-24 text-sm font-medium text-foreground">
                Service mapping {number}
            </legend>
            <button
                type="button"
                onClick={onRemoveMappingAction}
                className="w-full rounded-md border border-(--accent-negative)/30 px-2 py-1 text-xs font-medium text-(--accent-negative) hover:bg-(--accent-negative)/10 sm:absolute sm:top-3 sm:right-3 sm:w-auto"
                aria-label={`Remove service mapping ${number}`}
            >
                {CTA_LABELS.removeServiceMapping}
            </button>

            <PagerDutyServiceSelector
                rowId={row.id}
                value={row.serviceExternalId}
                state={serviceSelectorState}
                errorId={errorId}
                isInvalid={isInvalid}
                onChangeAction={onServiceChangeAction}
            />

            <div className="space-y-2">
                <p className="text-sm font-medium text-(--ink-muted)">Repository targets</p>
                {row.repositories.map((repository, repositoryIndex) => {
                    const targetNumber = repositoryIndex + 1;
                    return (
                        <div
                            key={repository.id}
                            className="grid gap-2 rounded-md border border-(--card-stroke) bg-(--card-80) p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
                        >
                            <div>
                                <label
                                    htmlFor={`pagerduty-repository-provider-${repository.id}`}
                                    className="mb-1.5 block text-xs font-medium text-(--ink-muted)"
                                >
                                    Provider
                                </label>
                                <input
                                    id={`pagerduty-repository-provider-${repository.id}`}
                                    aria-label={`Repository provider ${number}.${targetNumber}`}
                                    value={repository.provider}
                                    onChange={(event) =>
                                        onRepositoryChangeAction(
                                            repository.id,
                                            "provider",
                                            event.target.value,
                                        )
                                    }
                                    aria-invalid={isInvalid || undefined}
                                    aria-describedby={isInvalid ? errorId : undefined}
                                    className={`${inputClass} text-sm`}
                                    placeholder="github"
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor={`pagerduty-repository-name-${repository.id}`}
                                    className="mb-1.5 block text-xs font-medium text-(--ink-muted)"
                                >
                                    Repository full name
                                </label>
                                <input
                                    id={`pagerduty-repository-name-${repository.id}`}
                                    aria-label={`Repository full name ${number}.${targetNumber}`}
                                    value={repository.fullName}
                                    onChange={(event) =>
                                        onRepositoryChangeAction(
                                            repository.id,
                                            "fullName",
                                            event.target.value,
                                        )
                                    }
                                    aria-invalid={isInvalid || undefined}
                                    aria-describedby={isInvalid ? errorId : undefined}
                                    className={`${inputClass} text-sm`}
                                    placeholder="organization/repository"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => onRemoveRepositoryAction(repository.id)}
                                className="self-end rounded-md border border-(--card-stroke) px-2 py-2 text-xs font-medium text-(--ink-muted) hover:bg-(--card-60) hover:text-foreground"
                                aria-label={`Remove repository target ${number}.${targetNumber}`}
                            >
                                {CTA_LABELS.remove}
                            </button>
                        </div>
                    );
                })}
            </div>

            <button
                type="button"
                onClick={onAddRepositoryAction}
                className="rounded-md border border-(--card-stroke) px-3 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-60) hover:text-foreground"
                aria-label={`Add repository target for service mapping ${number}`}
            >
                {CTA_LABELS.addRepositoryTarget}
            </button>
        </fieldset>
    );
}
