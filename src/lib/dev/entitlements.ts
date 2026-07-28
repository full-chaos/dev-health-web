import type { DevCapabilities } from "./generated";

export const ASK_DEV_FEATURE = "ask_dev";
export const BYO_LLM_FEATURE = "byo_llm";
export const AGENT_CONTEXT_RUNTIME_FEATURE = "agent_context_runtime";

export type DevFeatureKey =
    typeof ASK_DEV_FEATURE | typeof BYO_LLM_FEATURE | typeof AGENT_CONTEXT_RUNTIME_FEATURE;

export type DevFeatureDecisions = Readonly<Partial<Record<DevFeatureKey, boolean>>>;

/**
 * Convert server-owned entitlement decisions into the canonical capability
 * envelope. Missing data fails closed and no AI-related gate implies another.
 */
export function devCapabilitiesFromEntitlements(
    features: DevFeatureDecisions | null | undefined,
    permissions: Readonly<{ canRead?: boolean; canManage?: boolean }> = {},
): DevCapabilities {
    return {
        schema_version: "dev_capabilities.v1",
        ask_dev: features?.[ASK_DEV_FEATURE] === true,
        byo_llm: features?.[BYO_LLM_FEATURE] === true,
        agent_context_runtime: features?.[AGENT_CONTEXT_RUNTIME_FEATURE] === true,
        can_read: permissions.canRead === true,
        can_manage: permissions.canManage === true,
    };
}
