export type PlatformUiMode = "off" | "shadow" | "enforce";

export const PLATFORM_UI_SWITCH = { name: "AUTHZ_PLATFORM_UI", onValue: "shadow" } as const;

export const PLATFORM_UI_ENFORCE_VALUE = "enforce";

// Exact match only: any other value is off.
export function platformUiMode(value: string | undefined): PlatformUiMode {
    if (value === PLATFORM_UI_SWITCH.onValue) return "shadow";
    if (value === PLATFORM_UI_ENFORCE_VALUE) return "enforce";
    return "off";
}
