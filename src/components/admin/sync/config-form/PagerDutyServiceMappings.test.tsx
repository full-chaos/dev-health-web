import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceRepositoryMappings } from "@/lib/admin/pagerduty";
import {
    PagerDutyServiceMappings,
    type PagerDutyMappingValidity,
} from "./PagerDutyServiceMappings";

const actions = vi.hoisted(() => ({
    getPagerDutyServices: vi.fn(),
}));

vi.mock("@/lib/admin/server", () => ({
    getPagerDutyServices: actions.getPagerDutyServices,
}));

function MappingHarness({
    initialMappings,
}: {
    readonly initialMappings: ServiceRepositoryMappings;
}) {
    const [mappings, setMappings] = useState(initialMappings);
    const [validity, setValidity] = useState<PagerDutyMappingValidity>({ valid: true });

    return (
        <>
            <PagerDutyServiceMappings
                credentialName="production"
                mappings={mappings}
                onChangeAction={setMappings}
                onValidityChangeAction={setValidity}
            />
            <output aria-label="Persisted mappings">{JSON.stringify(mappings)}</output>
            <output aria-label="Mapping validity">
                {validity.valid ? "valid" : validity.message}
            </output>
        </>
    );
}

describe("PagerDutyServiceMappings", () => {
    beforeEach(() => {
        actions.getPagerDutyServices.mockResolvedValue({
            data: {
                credential_name: "production",
                services: [
                    {
                        external_id: "service-api",
                        display_name: "API service",
                        name_resolved: true,
                        status: "active",
                    },
                    {
                        external_id: "service-worker",
                        display_name: "Worker service",
                        name_resolved: true,
                        status: "active",
                    },
                ],
            },
        });
    });

    it("round-trips every repository target and supports adding then removing one target", async () => {
        // Given: a persisted service maps to two repository targets.
        const user = userEvent.setup();
        render(
            <MappingHarness
                initialMappings={{
                    "service-api": [
                        { provider: "github", full_name: "full-chaos/api" },
                        { provider: "gitlab", full_name: "full-chaos/api-mirror" },
                    ],
                }}
            />,
        );

        // When: an administrator adds a target, completes it, and removes the first target.
        expect(screen.getByLabelText("Repository full name 1.1")).toHaveValue("full-chaos/api");
        expect(screen.getByLabelText("Repository full name 1.2")).toHaveValue(
            "full-chaos/api-mirror",
        );
        await user.click(
            screen.getByRole("button", { name: "Add repository target for service mapping 1" }),
        );
        await user.type(screen.getByLabelText("Repository full name 1.3"), "full-chaos/api-docs");
        await user.click(screen.getByRole("button", { name: "Remove repository target 1.1" }));

        // Then: every remaining target is emitted without local row metadata.
        await waitFor(() => {
            expect(screen.getByLabelText("Persisted mappings")).toHaveTextContent(
                JSON.stringify({
                    "service-api": [
                        { provider: "gitlab", full_name: "full-chaos/api-mirror" },
                        { provider: "github", full_name: "full-chaos/api-docs" },
                    ],
                }),
            );
        });
    });

    it("reports duplicate services as invalid without compacting either row", async () => {
        // Given: an editor that can stage independent service mapping rows.
        const user = userEvent.setup();
        const onChangeAction = vi.fn();
        const onValidityChangeAction = vi.fn();
        render(
            <PagerDutyServiceMappings
                credentialName="production"
                mappings={{}}
                onChangeAction={onChangeAction}
                onValidityChangeAction={onValidityChangeAction}
            />,
        );

        // When: two complete rows use the same PagerDuty service external ID.
        const addMapping = screen.getByRole("button", { name: "Add service mapping" });
        await waitFor(() => expect(addMapping).toBeEnabled());
        await user.click(addMapping);
        await user.selectOptions(screen.getByLabelText("PagerDuty service"), "service-api");
        await user.type(screen.getByLabelText("Repository full name 1.1"), "full-chaos/api");
        await user.click(addMapping);
        await user.selectOptions(screen.getAllByLabelText("PagerDuty service")[1], "service-api");
        await user.type(screen.getByLabelText("Repository full name 2.1"), "full-chaos/api-mirror");

        // Then: a typed invalid result and accessible error preserve both staged rows.
        await waitFor(() => {
            expect(onValidityChangeAction).toHaveBeenLastCalledWith({
                valid: false,
                message: "Each PagerDuty service can be mapped only once.",
            });
        });
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Each PagerDuty service can be mapped only once.",
        );
        expect(screen.getAllByLabelText("PagerDuty service")).toHaveLength(2);
        expect(onChangeAction).toHaveBeenCalledWith({
            "service-api": [{ provider: "github", full_name: "full-chaos/api" }],
        });
    });

    it("uses a direct legend and scopes duplicate errors to only duplicate service rows", async () => {
        // Given: three complete mappings where only the first two service IDs conflict.
        const user = userEvent.setup();
        render(
            <PagerDutyServiceMappings
                credentialName="production"
                mappings={{}}
                onChangeAction={vi.fn()}
                onValidityChangeAction={vi.fn()}
            />,
        );

        const addMapping = screen.getByRole("button", { name: "Add service mapping" });
        await waitFor(() => expect(addMapping).toBeEnabled());
        await user.click(addMapping);
        await user.selectOptions(screen.getByLabelText("PagerDuty service"), "service-api");
        await user.type(screen.getByLabelText("Repository full name 1.1"), "full-chaos/api");
        await user.click(addMapping);
        await user.selectOptions(screen.getAllByLabelText("PagerDuty service")[1], "service-api");
        await user.type(screen.getByLabelText("Repository full name 2.1"), "full-chaos/api-mirror");
        await user.click(addMapping);
        await user.selectOptions(
            screen.getAllByLabelText("PagerDuty service")[2],
            "service-worker",
        );
        await user.type(screen.getByLabelText("Repository full name 3.1"), "full-chaos/worker");

        // When: duplicate validation is announced.
        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent(
                "Each PagerDuty service can be mapped only once.",
            );
        });

        // Then: fieldsets use a direct accessible legend and only duplicate rows are described.
        const firstMapping = screen.getByRole("group", { name: "Service mapping 1" });
        expect(firstMapping.firstElementChild?.tagName).toBe("LEGEND");
        expect(screen.getAllByLabelText("PagerDuty service")[0]).toHaveAttribute(
            "aria-invalid",
            "true",
        );
        expect(screen.getByLabelText("Repository full name 2.1")).toHaveAttribute(
            "aria-describedby",
            "pagerduty-service-repository-mappings-error",
        );
        expect(screen.getAllByLabelText("PagerDuty service")[2]).not.toHaveAttribute(
            "aria-invalid",
        );
        expect(screen.getByLabelText("Repository full name 3.1")).not.toHaveAttribute(
            "aria-describedby",
        );
    });

    it("asks the administrator to select a service without exposing identifier terminology", async () => {
        const user = userEvent.setup();
        render(
            <PagerDutyServiceMappings
                credentialName="production"
                mappings={{}}
                onChangeAction={vi.fn()}
                onValidityChangeAction={vi.fn()}
            />,
        );

        const addMapping = screen.getByRole("button", { name: "Add service mapping" });
        await waitFor(() => expect(addMapping).toBeEnabled());
        await user.click(addMapping);

        expect(screen.getByRole("alert")).toHaveTextContent("Select a PagerDuty service.");
        expect(screen.getByRole("alert")).not.toHaveTextContent(/ID|identifier/i);
    });
});
