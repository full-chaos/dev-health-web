import { FormSection } from "./FormSection";
import { DestructiveWarning } from "./DestructiveWarning";

type DatasetsSectionProps = {
    availableTargets: { id: string; label: string }[];
    selectedTargets: string[];
    onTargetChange: (targetId: string, checked: boolean) => void;
    destructiveWarnings: string[];
};

export function DatasetsSection({
    availableTargets,
    selectedTargets,
    onTargetChange,
    destructiveWarnings,
}: DatasetsSectionProps) {
    return (
        <FormSection
            title="Datasets & sync targets"
            description="Which kinds of data this configuration pulls in."
        >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {availableTargets.map((target) => (
                    <label
                        key={target.id}
                        className="flex items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 hover:bg-(--card-60)"
                    >
                        <input
                            type="checkbox"
                            checked={selectedTargets.includes(target.id)}
                            onChange={(e) => onTargetChange(target.id, e.target.checked)}
                            className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
                        />
                        <span className="text-sm">{target.label}</span>
                    </label>
                ))}
            </div>
            <DestructiveWarning items={destructiveWarnings} />
        </FormSection>
    );
}
