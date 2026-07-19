import { UpgradeGate } from "@/components/billing/UpgradeGate";
import { SchedulePicker } from "../SchedulePicker";
import { FormSection } from "./FormSection";

type ScheduleSectionProps = {
    isActive: boolean;
    onIsActiveChange: (checked: boolean) => void;
    scheduleCron: string | null;
    timezone: string | null;
    onScheduleChange: (cron: string | null, timezone: string | null) => void;
    minIntervalHours?: number;
};

export function ScheduleSection({
    isActive,
    onIsActiveChange,
    scheduleCron,
    timezone,
    onScheduleChange,
    minIntervalHours,
}: ScheduleSectionProps) {
    return (
        <FormSection title="Schedule" description="When this sync runs automatically.">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="is_active"
                        name="is_active"
                        checked={isActive}
                        onChange={(e) => onIsActiveChange(e.target.checked)}
                        className="h-4 w-4 rounded border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
                    />
                    <label htmlFor="is_active" className="text-sm font-medium">
                        Enable this sync configuration
                    </label>
                </div>
                <p className="text-xs text-(--ink-muted)">
                    Activation keeps this configuration available for manual runs. Automatic
                    scheduling is controlled separately below.
                </p>
            </div>

            <UpgradeGate feature="scheduled_jobs" requiredTier="team">
                <SchedulePicker
                    value={scheduleCron}
                    timezone={timezone}
                    onChange={onScheduleChange}
                    minIntervalHours={minIntervalHours}
                />
            </UpgradeGate>
        </FormSection>
    );
}
