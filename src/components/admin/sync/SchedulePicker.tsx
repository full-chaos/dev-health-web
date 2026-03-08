import { useEffect, useMemo, useState } from "react";

type SchedulePickerProps = {
  value: string | null;
  timezone: string | null;
  onChange: (cron: string | null, tz: string | null) => void;
};

const SCHEDULE_PRESETS = [
  { value: null, label: "Manual only (no schedule)" },
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 0 * * *", label: "Daily at midnight" },
  { value: "0 0 * * 1", label: "Weekly on Monday" },
] as const;

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
  const isPreset = SCHEDULE_PRESETS.some((preset) => preset.value === value);
  return isPreset ? value : "custom";
}

export function SchedulePicker({ value, timezone, onChange }: SchedulePickerProps) {
  const timezones = useMemo(() => getSupportedTimezones(), []);
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const effectiveTimezone = timezone ?? browserTimezone;

  const [mode, setMode] = useState(getMode(value));
  const [customCron, setCustomCron] = useState(getMode(value) === "custom" ? value ?? "" : "");

  useEffect(() => {
    const nextMode = getMode(value);
    setMode(nextMode);
    setCustomCron(nextMode === "custom" ? value ?? "" : "");
  }, [value]);

  const selectedTimezone = timezones.includes(effectiveTimezone)
    ? effectiveTimezone
    : (timezones[0] ?? "UTC");

  const handleModeChange = (nextMode: string) => {
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
  };

  const handleTimezoneChange = (nextTimezone: string) => {
    if (mode === "manual") {
      onChange(null, nextTimezone);
      return;
    }
    if (mode === "custom") {
      onChange(customCron || null, nextTimezone);
      return;
    }
    onChange(mode, nextTimezone);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Schedule</h3>

      <div className="space-y-2">
        {SCHEDULE_PRESETS.map((preset) => {
          const modeValue = preset.value ?? "manual";
          return (
            <label
              key={modeValue}
              className="flex items-center gap-2 rounded-lg border border-(--card-stroke) bg-(--card-70) p-3 hover:bg-(--card-60)"
            >
              <input
                type="radio"
                name="schedule-mode"
                checked={mode === modeValue}
                onChange={() => handleModeChange(modeValue)}
                className="h-4 w-4 border-(--card-stroke) bg-(--card-80) text-(--accent) focus:ring-(--accent)"
              />
              <span className="text-sm">{preset.label}</span>
            </label>
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
          <label htmlFor="custom-cron" className="mb-1.5 block text-sm font-medium text-(--ink-muted)">
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
        </div>
      )}

      <div>
        <label htmlFor="schedule-timezone" className="mb-1.5 block text-sm font-medium text-(--ink-muted)">
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
