import type { ComponentProps } from "react";
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
                autoImportCapability={undefined}
                autoImportValues={{ teams: false, projects: false, members: false }}
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

    function renderReviewStep(overrides: Partial<ComponentProps<typeof ReviewStep>> = {}) {
        render(
            <ReviewStep
                name="Config"
                providerLabel="GitHub"
                credentialName="token"
                isRepoScoped={false}
                syncAllRepos={false}
                owner=""
                repoCount={0}
                datasetLabels={[]}
                autoImportCapability={undefined}
                autoImportValues={{ teams: false, projects: false, members: false }}
                depthLabel="30 days"
                scheduleLabel="Manual only"
                timezone={null}
                isActive={true}
                serviceRepositoryMappings={{}}
                pagerDutyServiceDisplayNames={{}}
                isPending={false}
                onBackAction={vi.fn()}
                {...overrides}
            />,
        );
    }

    it("shows no import rows when the provider has no auto-import capability at all", () => {
        // Given: a provider absent from the capabilities map (e.g. launchdarkly, pagerduty).
        renderReviewStep({ autoImportCapability: undefined });

        // Then: none of the three category labels render.
        expect(screen.queryByText("Import teams")).not.toBeInTheDocument();
        expect(screen.queryByText("Import projects")).not.toBeInTheDocument();
        expect(screen.queryByText("Import members")).not.toBeInTheDocument();
    });

    it("shows three rows, marking an unsupported category and reflecting enabled/disabled state", () => {
        // Given: GitHub -- teams and members supported, projects not (CHAOS-4323).
        renderReviewStep({
            autoImportCapability: {
                teams: true,
                projects: false,
                members: true,
                reasons: { projects: "GitHub attributes ownership via repos, not projects." },
            },
            autoImportValues: { teams: true, projects: false, members: false },
        });

        // Then: teams reflects "Enabled", projects reflects unsupported (not a checkbox
        // state), and members reflects "Disabled" -- three independent rows, not one.
        expect(screen.getByText("Import teams").parentElement).toHaveTextContent("Enabled");
        expect(screen.getByText("Import projects").parentElement).toHaveTextContent(
            "Not supported",
        );
        expect(screen.getByText("Import members").parentElement).toHaveTextContent("Disabled");
    });
});
