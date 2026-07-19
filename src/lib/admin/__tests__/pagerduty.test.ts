import { describe, expect, it } from "vitest";
import { PAGERDUTY_PLANNER_DATASETS, pagerDutyOAuthDatasets } from "../pagerduty";
import { getSyncTargetsForProvider } from "@/components/admin/sync/config-form/constants";
import { mergePagerDutyAdminMappings } from "@/components/admin/sync/config-form/pagerDutyMappingOptions";

describe("pagerDutyOAuthDatasets", () => {
    it("maps planner-only incident enrichment datasets to the incident OAuth scope", () => {
        const datasets = pagerDutyOAuthDatasets([
            "incident-alerts",
            "incident-log-entries",
            "incident-notes",
        ]);

        expect(datasets).toEqual(["incidents"]);
    });

    it("keeps the exact PagerDuty planner dataset inventory available to the UI", () => {
        expect(PAGERDUTY_PLANNER_DATASETS).toEqual([
            "services",
            "business-services",
            "escalation-policies",
            "schedules",
            "on-calls",
            "users",
            "teams",
            "incidents",
            "incident-alerts",
            "incident-log-entries",
            "incident-notes",
        ]);
    });

    it("uses the provider contract's single operational legacy sync target", () => {
        expect(getSyncTargetsForProvider("pagerduty").map((target) => target.id)).toEqual([
            "operational",
        ]);
    });

    it("preserves Compass and unrelated sync options when updating admin mappings", () => {
        const merged = mergePagerDutyAdminMappings(
            {
                schedule_cron: "0 * * * *",
                service_repository_mappings: {
                    compass: { "service-a": [{ provider: "github", full_name: "org/catalog" }] },
                    heuristic: { "service-b": [{ provider: "gitlab", full_name: "org/legacy" }] },
                },
            },
            { "service-a": [{ provider: "github", full_name: "org/api" }] },
        );

        expect(merged).toEqual({
            schedule_cron: "0 * * * *",
            service_repository_mappings: {
                compass: { "service-a": [{ provider: "github", full_name: "org/catalog" }] },
                heuristic: { "service-b": [{ provider: "gitlab", full_name: "org/legacy" }] },
                admin: { "service-a": [{ provider: "github", full_name: "org/api" }] },
            },
        });
    });
});
