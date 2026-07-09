import Link from "next/link";
import { CTA_LABELS } from "@/lib/design/cta";
import { DEPTH_TIER_LABELS, INITIAL_DEPTH_OPTIONS, isDepthOptionGated } from "./constants";
import { FormSection } from "./FormSection";

type InitialDepthSectionProps = {
    value: number | null;
    onChange: (value: number) => void;
    /** Current account tier — serializable data, not a function prop, so
     * gating stays computable at the client boundary (CHAOS-2838). */
    currentTier: string;
};

export function InitialDepthSection({ value, onChange, currentTier }: InitialDepthSectionProps) {
    const hasLockedOption = INITIAL_DEPTH_OPTIONS.some((opt) =>
        isDepthOptionGated(currentTier, opt.tier),
    );

    return (
        <FormSection
            title="Initial depth"
            description="How far back to pull historical data when first connecting."
        >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {INITIAL_DEPTH_OPTIONS.map((opt) => {
                    const isSelected = (value ?? 30) === opt.value;
                    const isGated = isDepthOptionGated(currentTier, opt.tier);
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
                            {isGated && opt.tier && (
                                <span className="ml-1 text-label-caps text-(--ink-muted)">
                                    {DEPTH_TIER_LABELS[opt.tier]}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            {hasLockedOption && (
                <p className="text-xs text-(--ink-muted)">
                    Locked ranges show the plan tier required to unlock them.{" "}
                    <Link href="/org/admin/settings" className="text-(--accent) underline">
                        {CTA_LABELS.upgradePlan}
                    </Link>
                </p>
            )}
        </FormSection>
    );
}
