import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

type ToolbarActionsProps = {
    allowAdvanced: boolean;
    copyFilters: () => Promise<void>;
    peopleQuery: string;
    resetFilters: () => void;
    setShowAdvanced: (value: boolean | ((prev: boolean) => boolean)) => void;
    showAdvanced: boolean;
    updatePeopleQuery: (nextQuery: string) => void;
    view?: string;
};

export function ToolbarActions({
    allowAdvanced,
    copyFilters,
    peopleQuery,
    resetFilters,
    setShowAdvanced,
    showAdvanced,
    updatePeopleQuery,
    view,
}: ToolbarActionsProps) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            {view === "people" && (
                <label className="flex items-center gap-2 text-xs">
                    <span className="uppercase tracking-[0.2em] text-(--ink-muted)">Search:</span>
                    <input
                        value={peopleQuery}
                        onChange={(event) => updatePeopleQuery(event.target.value)}
                        placeholder="Name or handle"
                        className="w-full sm:w-56 rounded-full border border-(--border) bg-card px-4 py-2 text-xs"
                    />
                </label>
            )}

            {allowAdvanced && (
                <button
                    type="button"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                    className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
                        showAdvanced
                            ? "border-(--accent) bg-(--accent-10) text-(--accent)"
                            : "border-(--border) bg-(--card-70) hover:border-(--ink-muted)"
                    }`}
                    aria-expanded={showAdvanced}
                >
                    Filters
                </button>
            )}
            <Button variant="secondary" onClick={resetFilters}>
                {CTA_LABELS.resetFilters}
            </Button>
            <Button variant="secondary" onClick={copyFilters}>
                {CTA_LABELS.copy}
            </Button>
        </div>
    );
}
