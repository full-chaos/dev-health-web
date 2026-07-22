"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getPagerDutyServices } from "@/lib/admin/server";
import type { PagerDutyServiceOption, ServiceRepositoryMappings } from "@/lib/admin/pagerduty";
import { CTA_LABELS } from "@/lib/design/cta";
import { FormSection } from "./FormSection";
import { PagerDutyMappingRow } from "./PagerDutyMappingRow";
import {
    duplicatePagerDutyServiceIds,
    mappingRowsToOptions,
    persistedMappingRows,
    type EditableServiceMapping,
    type PagerDutyMappingValidity,
    validatePagerDutyMappingRows,
} from "./pagerDutyMappingRows";
import type { PagerDutyServiceSelectorState } from "./PagerDutyServiceSelector";

type PagerDutyServiceMappingsProps = {
    readonly credentialName: string | null;
    readonly mappings: ServiceRepositoryMappings;
    readonly onChangeAction: (mappings: ServiceRepositoryMappings) => void;
    readonly onValidityChangeAction: (validity: PagerDutyMappingValidity) => void;
    readonly onServiceDisplayNamesChangeAction?: (
        displayNames: Readonly<Record<string, string>>,
    ) => void;
};

type PagerDutyServicesLoad =
    | { readonly kind: "empty" }
    | { readonly kind: "error" }
    | { readonly kind: "ready"; readonly services: readonly PagerDutyServiceOption[] };

type LoadedPagerDutyServices = {
    readonly credentialName: string;
    readonly requestVersion: number;
    readonly result: PagerDutyServicesLoad;
};

function assertNever(value: never): never {
    throw new Error(`Unhandled PagerDuty service load state: ${JSON.stringify(value)}`);
}

export type { PagerDutyMappingValidity } from "./pagerDutyMappingRows";

export function PagerDutyServiceMappings({
    credentialName,
    mappings,
    onChangeAction,
    onValidityChangeAction,
    onServiceDisplayNamesChangeAction,
}: PagerDutyServiceMappingsProps) {
    const [rows, setRows] = useState(() => persistedMappingRows(mappings));
    const nextDraftId = useRef(0);
    const [requestVersion, setRequestVersion] = useState(0);
    const [loadedServices, setLoadedServices] = useState<LoadedPagerDutyServices | null>(null);
    const structuralValidity = useMemo(() => validatePagerDutyMappingRows(rows), [rows]);
    const duplicateServiceIds = useMemo(() => duplicatePagerDutyServiceIds(rows), [rows]);
    const duplicateServiceError = structuralValidity.valid
        ? false
        : structuralValidity.message === "Each PagerDuty service can be mapped only once.";
    const errorId = "pagerduty-service-repository-mappings-error";

    useEffect(() => {
        if (!credentialName) return;
        let current = true;
        void getPagerDutyServices(credentialName).then(
            (response) => {
                if (!current) return;
                if (!response.data) {
                    setLoadedServices({
                        credentialName,
                        requestVersion,
                        result: { kind: "error" },
                    });
                    return;
                }
                const services = response.data.services;
                setLoadedServices({
                    credentialName,
                    requestVersion,
                    result: services.length > 0 ? { kind: "ready", services } : { kind: "empty" },
                });
            },
            () => {
                if (current) {
                    setLoadedServices({
                        credentialName,
                        requestVersion,
                        result: { kind: "error" },
                    });
                }
            },
        );
        return () => {
            current = false;
        };
    }, [credentialName, requestVersion]);

    const serviceSelectorState = useMemo<PagerDutyServiceSelectorState>(() => {
        if (!credentialName) return { kind: "no-credential" };
        if (
            !loadedServices ||
            loadedServices.credentialName !== credentialName ||
            loadedServices.requestVersion !== requestVersion
        ) {
            return { kind: "loading" };
        }
        switch (loadedServices.result.kind) {
            case "ready":
                return loadedServices.result;
            case "empty":
                return loadedServices.result;
            case "error":
                return {
                    kind: "error",
                    onRetryAction: () => setRequestVersion((current) => current + 1),
                };
            default:
                return assertNever(loadedServices.result);
        }
    }, [credentialName, loadedServices, requestVersion]);
    const canAddMapping = serviceSelectorState.kind === "ready";
    const validity = structuralValidity;
    const emittedMappings = useMemo(
        () => (validity.valid ? mappingRowsToOptions(rows) : null),
        [rows, validity],
    );
    const selectedServiceDisplayNames = useMemo(() => {
        if (loadedServices?.result.kind !== "ready") return {};
        const names = new Map(
            loadedServices.result.services
                .filter((service) => service.name_resolved)
                .map((service) => [service.external_id, service.display_name]),
        );
        return Object.fromEntries(
            rows.flatMap((row) => {
                const displayName = names.get(row.serviceExternalId);
                return displayName ? [[row.serviceExternalId, displayName]] : [];
            }),
        );
    }, [loadedServices, rows]);

    useEffect(() => {
        onValidityChangeAction(validity);
        if (emittedMappings) onChangeAction(emittedMappings);
        onServiceDisplayNamesChangeAction?.(selectedServiceDisplayNames);
    }, [
        emittedMappings,
        onChangeAction,
        onServiceDisplayNamesChangeAction,
        onValidityChangeAction,
        selectedServiceDisplayNames,
        validity,
    ]);

    function updateMapping(
        mappingId: string,
        transform: (row: EditableServiceMapping) => EditableServiceMapping,
    ) {
        setRows((currentRows) =>
            currentRows.map((row) => (row.id === mappingId ? transform(row) : row)),
        );
    }

    return (
        <FormSection
            title="Service repository mappings"
            description="Connect each PagerDuty service to every repository it supports. Incidents sync without a mapping, but repository-scoped incident metrics and correlations require one."
        >
            <section
                id="pagerduty-service-repository-mappings"
                tabIndex={-1}
                aria-describedby={validity.valid ? undefined : errorId}
                className="space-y-3 outline-none"
            >
                {validity.valid ? null : (
                    <p
                        id={errorId}
                        role="alert"
                        className="rounded-lg border border-(--accent-negative)/30 bg-(--accent-negative)/10 p-3 text-sm text-(--accent-negative)"
                    >
                        {validity.message}
                    </p>
                )}

                {rows.map((row, mappingIndex) => (
                    <PagerDutyMappingRow
                        key={row.id}
                        row={row}
                        mappingIndex={mappingIndex}
                        isInvalid={
                            !validity.valid &&
                            (!duplicateServiceError ||
                                duplicateServiceIds.has(row.serviceExternalId.trim()))
                        }
                        errorId={errorId}
                        serviceSelectorState={serviceSelectorState}
                        onServiceChangeAction={(serviceExternalId) =>
                            updateMapping(row.id, (current) => ({
                                ...current,
                                serviceExternalId,
                            }))
                        }
                        onRepositoryChangeAction={(repositoryId, field, value) =>
                            updateMapping(row.id, (current) => ({
                                ...current,
                                repositories: current.repositories.map((repository) =>
                                    repository.id === repositoryId
                                        ? { ...repository, [field]: value }
                                        : repository,
                                ),
                            }))
                        }
                        onRemoveRepositoryAction={(repositoryId) =>
                            updateMapping(row.id, (current) => ({
                                ...current,
                                repositories: current.repositories.filter(
                                    (repository) => repository.id !== repositoryId,
                                ),
                            }))
                        }
                        onAddRepositoryAction={() =>
                            updateMapping(row.id, (current) => ({
                                ...current,
                                repositories: [
                                    ...current.repositories,
                                    {
                                        id: `draft-repository-${nextDraftId.current++}`,
                                        provider: "github",
                                        fullName: "",
                                    },
                                ],
                            }))
                        }
                        onRemoveMappingAction={() =>
                            setRows((currentRows) =>
                                currentRows.filter((current) => current.id !== row.id),
                            )
                        }
                    />
                ))}

                <button
                    type="button"
                    disabled={!canAddMapping}
                    onClick={() =>
                        setRows((currentRows) => [
                            ...currentRows,
                            {
                                id: `draft-mapping-${nextDraftId.current++}`,
                                serviceExternalId: "",
                                repositories: [
                                    {
                                        id: `draft-repository-${nextDraftId.current++}`,
                                        provider: "github",
                                        fullName: "",
                                    },
                                ],
                            },
                        ])
                    }
                    className="rounded-md border border-(--card-stroke) px-3 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-60) hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {CTA_LABELS.addServiceMapping}
                </button>
            </section>
        </FormSection>
    );
}
