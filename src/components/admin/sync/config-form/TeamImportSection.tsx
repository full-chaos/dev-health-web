import type { AutoImportCapabilities, AutoImportCategory } from "@/lib/admin/types";
import { AUTO_IMPORT_CATEGORIES } from "./constants";
import { FormSection } from "./FormSection";

type TeamImportSectionProps = {
    provider: string;
    /**
     * `null` means the capability fetch FAILED (distinct from `{}`, a
     * successful fetch that found no capability for this provider) -- the
     * section hides either way, since there's nothing safe to offer without
     * knowing what's actually supported, but callers must NOT collapse the
     * two when deciding what to persist (see SyncConfigForm.buildSyncOptions).
     */
    capabilities: AutoImportCapabilities | null;
    values: Record<AutoImportCategory, boolean>;
    onChange: (category: AutoImportCategory, checked: boolean) => void;
};

const FALLBACK_UNSUPPORTED_REASON = "This provider doesn't support team/project/member import.";

/**
 * "Import from provider during sync" (CHAOS-4323): three independent
 * checkboxes -- teams / projects / members -- replacing the old single
 * "Auto-import teams, projects & members" toggle. chris: "get rid of auto
 * import, it's confusing as fuck. Each of these items needs to just be
 * selectable." Lives in the wizard's MAIN options, not tucked under
 * "Advanced" (this used to be the entirety of AdvancedSection.tsx, which had
 * no other field).
 *
 * Capability-aware: `capabilities` is the live
 * `GET /sync-configs/auto-import-capabilities` response (ops
 * `providers/team_capabilities.py`'s per-provider truth), never a
 * duplicated frontend constant. A provider absent from the map (e.g.
 * launchdarkly, pagerduty -- no team/project/member concept at all) hides
 * the whole section; a provider present but missing one category (e.g.
 * GitHub has no "Projects" import) renders that one checkbox disabled with
 * its reason.
 */
export function TeamImportSection({
    provider,
    capabilities,
    values,
    onChange,
}: TeamImportSectionProps) {
    const capability = capabilities?.[provider];
    if (!capability || !(capability.teams || capability.projects || capability.members)) {
        return null;
    }

    return (
        <FormSection
            title="Import from provider during sync"
            description="Each item is independent -- select only what you need for ownership and attribution."
        >
            {AUTO_IMPORT_CATEGORIES.map((category) => {
                const supported = capability[category.id];
                const reason = capability.reasons[category.id] ?? FALLBACK_UNSUPPORTED_REASON;
                const checkboxId = `auto_import_${category.id}`;
                return (
                    <div key={category.id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id={checkboxId}
                                name={checkboxId}
                                checked={supported && values[category.id]}
                                disabled={!supported}
                                onChange={(e) => onChange(category.id, e.target.checked)}
                                className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent) disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <label
                                htmlFor={checkboxId}
                                className={
                                    supported
                                        ? "text-sm font-medium"
                                        : "text-sm font-medium text-(--ink-muted)"
                                }
                            >
                                {category.label}
                            </label>
                        </div>
                        <p className="text-xs text-(--ink-muted)">
                            {supported ? category.description : reason}
                        </p>
                    </div>
                );
            })}
        </FormSection>
    );
}
