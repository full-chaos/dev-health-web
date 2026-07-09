import { useMemo, useState, useCallback } from "react";

type SchedulePickerProps = {
    value: string | null;
    timezone: string | null;
    onChange: (cron: string | null, tz: string | null) => void;
    minIntervalHours?: number;
};

type SchedulePreset = {
    value: string | null;
    label: string;
    intervalHours: number | null;
    /** User-facing consequence of this cadence (CHAOS-2838 acceptance #4). */
    description: string;
};

const SCHEDULE_PRESETS: SchedulePreset[] = [
    {
        value: null,
        label: "Manual only (no schedule)",
        intervalHours: null,
        description: "Data only updates when you manually trigger a sync.",
    },
    {
        value: "0 * * * *",
        label: "Every hour",
        intervalHours: 1,
        description: "Near real-time data, but the most frequent API usage of these presets.",
    },
    {
        value: "0 */6 * * *",
        label: "Every 6 hours",
        intervalHours: 6,
        description: "Frequent updates with moderate API usage.",
    },
    {
        value: "0 0 * * *",
        label: "Daily at midnight",
        intervalHours: 24,
        description: "Once-daily updates with lower API usage.",
    },
    {
        value: "0 0 * * 1",
        label: "Weekly on Monday",
        intervalHours: 168,
        description:
            "Once-weekly updates — the lowest API usage; data can go a week between refreshes.",
    },
];

function getSupportedTimezones(): string[] {
    if (typeof Intl.supportedValuesOf === "function") {
        return Intl.supportedValuesOf("timeZone");
    }
    return ["UTC"];
}

function getBrowserTimezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
}

function getMode(value: string | null): string {
    if (value === null) {
        return "manual";
    }
    const isPreset = SCHEDULE_PRESETS.some((p) => p.value === value);
    return isPreset ? value : "custom";
}

export function SchedulePicker({
    value,
    timezone,
    onChange,
    minIntervalHours,
}: SchedulePickerProps) {
    const timezones = useMemo(() => getSupportedTimezones(), []);
    const browserTimezone = useMemo(() => getBrowserTimezone(), []);
    const effectiveTimezone = timezone ?? browserTimezone;

    const visiblePresets = useMemo(() => {
        if (minIntervalHours === undefined) return SCHEDULE_PRESETS;
        return SCHEDULE_PRESETS.filter(
            (p) => p.intervalHours === null || p.intervalHours >= minIntervalHours,
        );
    }, [minIntervalHours]);

    const [mode, setMode] = useState(() => getMode(value));
    const [customCron, setCustomCron] = useState(getMode(value) === "custom" ? (value ?? "") : "");

    const selectedTimezone = timezones.includes(effectiveTimezone)
        ? effectiveTimezone
        : (timezones[0] ?? "UTC");

    const handleModeChange = useCallback(
        (nextMode: string) => {
            setMode(nextMode);
            if (nextMode === "manual") {
                onChange(null, selectedTimezone);
                return;
            }
            if (nextMode === "custom") {
                onChange(customCron || null, selectedTimezone);
                return;
            }
            onChange(nextMode, selectedTimezone);
        },
        [customCron, onChange, selectedTimezone],
    );

    const handleTimezoneChange = useCallback(
        (nextTimezone: string) => {
            if (mode === "manual") {
                onChange(null, nextTimezone);
                return;
            }
            if (mode === "custom") {
                onChange(customCron || null, nextTimezone);
                return;
            }
            onChange(mode, nextTimezone);
        },
        [mode, customCron, onChange],
    );

    return (
        <div className="space-y-4">
            <h3 className="text-sm font-medium">Schedule</h3>

            <div className="space-y-2">
                {visiblePresets.map((preset) => {
                    const modeValue = preset.value ?? "manual";
                    return (
                        <div
                            key={modeValue}
                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 hover:bg-(--card-60)"
                        >
                            <label className="flex items-center gap-2">
                                <input
                                    type="radio"
                                    name="schedule-mode"
                                    checked={mode === modeValue}
                                    onChange={() => handleModeChange(modeValue)}
                                    className="h-4 w-4 border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
                                />
                                <span className="text-sm">{preset.label}</span>
                            </label>
                            <p className="mt-1 pl-6 text-xs text-(--ink-muted)">
                                {preset.description}
                            </p>
                        </div>
                    );
                })}

                <label className="flex items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 hover:bg-(--card-60)">
                    <input
                        type="radio"
                        name="schedule-mode"
                        checked={mode === "custom"}
                        onChange={() => handleModeChange("custom")}
                        className="h-4 w-4 border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
                    />
                    <span className="text-sm">Custom cron expression</span>
                </label>
            </div>

            {mode === "custom" && (
                <div>
                    <label
                        htmlFor="custom-cron"
                        className="mb-1.5 block text-sm font-medium text-(--ink-muted)"
                    >
                        Custom cron
                    </label>
                    <input
                        id="custom-cron"
                        type="text"
                        value={customCron}
                        onChange={(event) => {
                            setCustomCron(event.target.value);
                            onChange(event.target.value || null, selectedTimezone);
                        }}
                        placeholder="e.g., 15 3 * * *"
                        className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                    />
                    {minIntervalHours !== undefined && minIntervalHours > 0 && (
                        <p className="mt-1.5 text-xs text-(--ink-muted)">
                            Your plan requires a minimum interval of{" "}
                            {minIntervalHours < 1
                                ? `${Math.round(minIntervalHours * 60)} minutes`
                                : minIntervalHours === 1
                                  ? "1 hour"
                                  : `${minIntervalHours} hours`}{" "}
                            between syncs.
                        </p>
                    )}
                </div>
            )}

            <div>
                <label
                    htmlFor="schedule-timezone"
                    className="mb-1.5 block text-sm font-medium text-(--ink-muted)"
                >
                    Timezone
                </label>
                <select
                    id="schedule-timezone"
                    value={selectedTimezone}
                    onChange={(event) => handleTimezoneChange(event.target.value)}
                    className="w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
                >
                    {timezones.map((tz) => (
                        <option key={tz} value={tz}>
                            {tz}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
}
