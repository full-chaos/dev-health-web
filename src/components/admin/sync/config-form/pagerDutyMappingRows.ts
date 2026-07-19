import type { ServiceRepositoryMappings } from "@/lib/admin/pagerduty";

export type EditableRepository = {
    readonly id: string;
    readonly provider: string;
    readonly fullName: string;
};

export type EditableServiceMapping = {
    readonly id: string;
    readonly serviceExternalId: string;
    readonly repositories: readonly EditableRepository[];
};

export type PagerDutyMappingValidity =
    { readonly valid: true } | { readonly valid: false; readonly message: string };

export function duplicatePagerDutyServiceIds(
    rows: readonly EditableServiceMapping[],
): ReadonlySet<string> {
    const serviceIds = new Set<string>();
    const duplicates = new Set<string>();

    for (const row of rows) {
        const serviceExternalId = row.serviceExternalId.trim();
        if (!serviceExternalId) continue;
        if (serviceIds.has(serviceExternalId)) duplicates.add(serviceExternalId);
        serviceIds.add(serviceExternalId);
    }

    return duplicates;
}

export function persistedMappingRows(
    mappings: ServiceRepositoryMappings,
): readonly EditableServiceMapping[] {
    return Object.entries(mappings).map(([serviceExternalId, repositories], mappingIndex) => ({
        id: `persisted-mapping-${mappingIndex}`,
        serviceExternalId,
        repositories: repositories.map((repository, repositoryIndex) => ({
            id: `persisted-repository-${mappingIndex}-${repositoryIndex}`,
            provider: repository.provider,
            fullName: repository.full_name,
        })),
    }));
}

export function validatePagerDutyMappingRows(
    rows: readonly EditableServiceMapping[],
): PagerDutyMappingValidity {
    const serviceIds = new Set<string>();
    for (const row of rows) {
        const serviceExternalId = row.serviceExternalId.trim();
        if (!serviceExternalId) {
            return { valid: false, message: "Select a PagerDuty service." };
        }
        if (serviceIds.has(serviceExternalId)) {
            return { valid: false, message: "Each PagerDuty service can be mapped only once." };
        }
        serviceIds.add(serviceExternalId);
        if (row.repositories.length === 0) {
            return {
                valid: false,
                message: "Each PagerDuty service needs at least one repository target.",
            };
        }
        if (
            row.repositories.some(
                (repository) => !repository.provider.trim() || !repository.fullName.trim(),
            )
        ) {
            return {
                valid: false,
                message: "Every repository target needs a provider and full repository name.",
            };
        }
    }
    return { valid: true };
}

export function mappingRowsToOptions(
    rows: readonly EditableServiceMapping[],
): ServiceRepositoryMappings {
    return Object.fromEntries(
        rows.map((row) => [
            row.serviceExternalId.trim(),
            row.repositories.map((repository) => ({
                provider: repository.provider.trim(),
                full_name: repository.fullName.trim(),
            })),
        ]),
    );
}
