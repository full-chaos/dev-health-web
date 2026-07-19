import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewStep } from "./ReviewStep";

describe("ReviewStep", () => {
    it("summarizes resolved PagerDuty service names and repository targets without exposing keys", () => {
        // Given: staged PagerDuty mappings with multiple repository targets.
        render(
            <ReviewStep
                name="PagerDuty Services"
                providerLabel="PagerDuty"
                credentialName="PagerDuty token"
                isRepoScoped={false}
                syncAllRepos={false}
                owner=""
                repoCount={0}
                datasetLabels={["PagerDuty operational data"]}
                showAutoImport={false}
                autoImportTeams={false}
                depthLabel="30 days"
                scheduleLabel="Manual only"
                timezone={null}
                isActive={true}
                serviceRepositoryMappings={{
                    "service-api": [
                        { provider: "github", full_name: "full-chaos/api" },
                        { provider: "gitlab", full_name: "full-chaos/api-mirror" },
                    ],
                    "service-worker": [{ provider: "github", full_name: "full-chaos/worker" }],
                }}
                pagerDutyServiceDisplayNames={{
                    "service-api": "API service",
                    "service-worker": "Worker service",
                }}
                isPending={false}
                onBackAction={vi.fn()}
            />,
        );

        // When: review renders immediately before the create action.
        const mappingRow = screen.getByText("Service repository mappings").parentElement;

        // Then: the summary reports resolved service names and concrete targets without raw keys.
        expect(mappingRow).toHaveTextContent(
            "API service: github:full-chaos/api, gitlab:full-chaos/api-mirror",
        );
        expect(mappingRow).toHaveTextContent("Worker service: github:full-chaos/worker");
        expect(mappingRow).not.toHaveTextContent("service-api");
        expect(mappingRow).not.toHaveTextContent("service-worker");
    });
});
