import type { ServiceRepositoryMappings } from "@/lib/admin/pagerduty";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function readRepository(
    value: unknown,
): { readonly provider: string; readonly full_name: string } | null {
    if (!isRecord(value)) return null;
    const provider = value["provider"];
    const fullName = value["full_name"];
    if (!isNonBlankString(provider) || !isNonBlankString(fullName)) return null;
    return { provider, full_name: fullName };
}

function copyMappings(mappings: ServiceRepositoryMappings): ServiceRepositoryMappings {
    return Object.fromEntries(
        Object.entries(mappings).map(([serviceId, repositories]) => [
            serviceId,
            repositories.map((repository) => ({ ...repository })),
        ]),
    );
}

export function readPagerDutyAdminMappings(
    options: Record<string, unknown> | undefined,
): ServiceRepositoryMappings {
    const root = options?.service_repository_mappings;
    if (!isRecord(root) || !isRecord(root.admin)) return {};
    const mappings: ServiceRepositoryMappings = {};
    for (const [serviceId, value] of Object.entries(root.admin)) {
        if (!isNonBlankString(serviceId) || !Array.isArray(value)) continue;
        const repositories = value.flatMap((candidate) => {
            const repository = readRepository(candidate);
            return repository ? [repository] : [];
        });
        if (repositories.length > 0) mappings[serviceId] = repositories;
    }
    return mappings;
}

export function mergePagerDutyAdminMappings(
    syncOptions: Record<string, unknown>,
    mappings: ServiceRepositoryMappings,
): Record<string, unknown> {
    const existing = syncOptions["service_repository_mappings"];
    if (!isRecord(existing)) {
        if (Object.keys(mappings).length === 0) return { ...syncOptions };
        return {
            ...syncOptions,
            service_repository_mappings: { admin: copyMappings(mappings) },
        };
    }

    const namespaces = { ...existing };
    if (Object.keys(mappings).length === 0) {
        delete namespaces["admin"];
    } else {
        namespaces["admin"] = copyMappings(mappings);
    }

    const nextOptions = { ...syncOptions };
    if (Object.keys(namespaces).length === 0) {
        delete nextOptions["service_repository_mappings"];
    } else {
        nextOptions["service_repository_mappings"] = namespaces;
    }
    return nextOptions;
}
