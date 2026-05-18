// Shared types and constants for the FlowView component family

export type FlowSubTab = "investment_mix" | "code_hotspots" | "investment_expense" | "state_flow";

export type FlowTabDef = {
    id: FlowSubTab;
    label: string;
    description: string;
    demoOnly?: boolean;
};

// Selection model for the Inspect panel
export type FlowSelection = {
    view: FlowSubTab;
    path: string[];
    key?: string;
    metricValue: number;
    percentTotal: number;
    unit: string;
    children?: Array<{ name: string; value: number }>;
    transition?: { from: string; to: string };
    outcomes?: string[];
};

export const ALL_FLOW_TABS: FlowTabDef[] = [
    { id: "investment_mix", label: "Investment Mix", description: "Where effort allocates across investment areas" },
    { id: "code_hotspots", label: "Code Hotspots", description: "Where change concentrates in the codebase", demoOnly: true },
    { id: "investment_expense", label: "Investment Expense", description: "Effort shift from planned to unplanned work", demoOnly: true },
    { id: "state_flow", label: "State Flow", description: "Work item state transitions and flow paths" },
];
