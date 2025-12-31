/**
 * Role context definitions for role-aware investigation flow.
 * Roles affect starting focus and framing, not data visibility.
 */

export type RoleType = "ic" | "em" | "pm" | "leadership";

export type RoleConfig = {
    id: RoleType;
    label: string;
    shortLabel: string;
    framing: string;
    primaryQuadrant: "review_load_latency" | "wip_throughput" | "churn_throughput" | "cycle_throughput";
    secondaryQuadrant: "review_load_latency" | "wip_throughput" | "churn_throughput" | "cycle_throughput";
    investigationOrder: readonly string[];
};

export const ROLE_CONFIGS: Record<RoleType, RoleConfig> = {
    ic: {
        id: "ic",
        label: "Individual Contributor",
        shortLabel: "IC",
        framing: "Work scope, review flow, and delivery pace.",
        primaryQuadrant: "review_load_latency",
        secondaryQuadrant: "cycle_throughput",
        investigationOrder: ["review", "cycle", "churn", "investment"] as const,
    },
    em: {
        id: "em",
        label: "Engineering Manager",
        shortLabel: "EM",
        framing: "Load, flow, and coordination patterns.",
        primaryQuadrant: "wip_throughput",
        secondaryQuadrant: "review_load_latency",
        investigationOrder: ["wip", "review", "cycle", "investment"] as const,
    },
    pm: {
        id: "pm",
        label: "Product Manager",
        shortLabel: "PM",
        framing: "Product direction and delivery flow.",
        primaryQuadrant: "wip_throughput",
        secondaryQuadrant: "churn_throughput",
        investigationOrder: ["churn", "wip", "cycle", "investment"] as const,
    },
    leadership: {
        id: "leadership",
        label: "Leadership / Portfolio",
        shortLabel: "Leadership",
        framing: "System evolution and investment balance.",
        primaryQuadrant: "churn_throughput",
        secondaryQuadrant: "cycle_throughput",
        investigationOrder: ["investment", "churn", "cycle", "wip"] as const,
    },
};

export const ROLE_OPTIONS: RoleType[] = ["ic", "em", "pm", "leadership"];

export const DEFAULT_ROLE: RoleType = "ic";

export const getRoleConfig = (role: RoleType | string | undefined): RoleConfig =>
    ROLE_CONFIGS[role as RoleType] ?? ROLE_CONFIGS[DEFAULT_ROLE];

export const isValidRole = (role: string | null | undefined): role is RoleType =>
    Boolean(role && role in ROLE_CONFIGS);
