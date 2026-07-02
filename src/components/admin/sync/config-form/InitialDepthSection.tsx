import { INITIAL_DEPTH_OPTIONS } from "./constants";
import { FormSection } from "./FormSection";

type InitialDepthSectionProps = {
    value: number | null;
    onChange: (value: number) => void;
    isTierGated: (tier: "team" | "enterprise" | null) => boolean;
};

export function InitialDepthSection({ value, onChange, isTierGated }: InitialDepthSectionProps) {
    return (
        <FormSection
            title="Initial depth"
            description="How far back to pull historical data when first connecting."
        >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {INITIAL_DEPTH_OPTIONS.map((opt) => {
                    const isSelected = (value ?? 30) === opt.value;
                    const isGated = isTierGated(opt.tier);
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            disabled={isGated}
                            onClick={() => onChange(opt.value)}
                            className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                                isSelected
                                    ? "border-(--accent) bg-(--accent)/10 text-(--accent)"
                                    : isGated
                                      ? "cursor-not-allowed border-(--card-stroke) bg-(--card-70) text-(--ink-muted) opacity-50"
                                      : "border-(--card-stroke) hover:border-(--accent)/50"
                            }`}
                        >
                            {opt.label}
                            {isGated && <span className="ml-1 text-label-caps">🔒</span>}
                        </button>
                    );
                })}
            </div>
        </FormSection>
    );
}
