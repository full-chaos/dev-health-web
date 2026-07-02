import { AUTO_IMPORT_PROVIDERS } from "./constants";
import { FormSection } from "./FormSection";

type AdvancedSectionProps = {
    provider: string;
    autoImportTeams: boolean;
    onChange: (checked: boolean) => void;
};

export function AdvancedSection({ provider, autoImportTeams, onChange }: AdvancedSectionProps) {
    if (!AUTO_IMPORT_PROVIDERS.includes(provider)) return null;

    return (
        <FormSection
            title="Advanced options"
            description="Optional behavior most syncs don't need."
        >
            <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="auto_import_teams"
                        name="auto_import_teams"
                        checked={autoImportTeams}
                        onChange={(e) => onChange(e.target.checked)}
                        className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
                    />
                    <label htmlFor="auto_import_teams" className="text-sm font-medium">
                        Auto-import teams, projects &amp; members
                    </label>
                </div>
                <p className="text-xs text-(--ink-muted)">
                    Discover and import teams, projects, and members from this provider during sync
                    to populate ownership and attribution.
                </p>
            </div>
        </FormSection>
    );
}
