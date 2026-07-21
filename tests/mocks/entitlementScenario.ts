export type EntitlementScenario =
    | "provisioned"
    | "unprovisioned"
    | "invalid"
    | "error"
    | "canonical-absent"
    | "canonical-disabled"
    | "canonical-enabled";

let currentEntitlementScenario: EntitlementScenario = "unprovisioned";

export function setEntitlementScenario(scenario: string): boolean {
    switch (scenario) {
        case "provisioned":
        case "unprovisioned":
        case "invalid":
        case "error":
        case "canonical-absent":
        case "canonical-disabled":
        case "canonical-enabled":
            currentEntitlementScenario = scenario;
            return true;
        default:
            return false;
    }
}

export function getEntitlementScenario(): EntitlementScenario {
    return currentEntitlementScenario;
}
