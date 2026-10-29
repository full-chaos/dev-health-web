export type EntitlementScenario =
    | "provisioned"
    | "unprovisioned"
    | "invalid"
    | "error"
    | "canonical-absent"
    | "canonical-disabled"
    | "canonical-enabled"
    | "investment-enabled"
    | "ask-dev-enabled"
    | "ask-dev-off";

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
        case "investment-enabled":
        case "ask-dev-enabled":
        case "ask-dev-off":
            currentEntitlementScenario = scenario;
            return true;
        default:
            return false;
    }
}

export function getEntitlementScenario(): EntitlementScenario {
    return currentEntitlementScenario;
}
