export type PlatformUiMode = "off" | "shadow";

export const PLATFORM_UI_SWITCH = { name: "AUTHZ_PLATFORM_UI", onValue: "shadow" } as const;

// Exact match only: any other value, including "enforce", is off. This leaf has no enforce mode.
export function platformUiMode(value: string | undefined): PlatformUiMode {
    return value === PLATFORM_UI_SWITCH.onValue ? "shadow" : "off";
}
