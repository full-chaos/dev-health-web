"use client";

import { gql, useQuery } from "urql";
import {
    DataHealthIdentityDocument,
    type DataHealthIdentityQuery,
    type DataHealthIdentityQueryVariables,
} from "@/lib/graphql/__generated__/graphql";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { ProviderBadge } from "@/components/admin/identities/ProviderBadge";

import { AliasSuggestionRow } from "./AliasSuggestionRow";

const DATA_HEALTH_IDENTITY_QUERY = gql<DataHealthIdentityQuery, DataHealthIdentityQueryVariables>(
    DataHealthIdentityDocument.toString(),
);

export function IdentityGapsTable() {
    const [result] = useQuery({
        query: DATA_HEALTH_IDENTITY_QUERY,
        variables: { team: "ALL" },
    });

    const { data, fetching, error } = result;

    if (fetching) return <div className="p-4 text-(--ink-muted)">Loading identity gaps...</div>;
    if (error) return <div className="p-4 text-(--accent-negative)">Error: {error.message}</div>;

    const health = data?.dataHealth?.identityMapping;
    if (!health) return null;

    type UnmappedIdentity = NonNullable<
        NonNullable<
            NonNullable<DataHealthIdentityQuery["dataHealth"]>["identityMapping"]
        >["unmappedIdentities"]
    >[number];
    const columns: DataTableColumn<UnmappedIdentity>[] = [
        {
            key: "provider",
            header: "Provider",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4",
            render: (id) => (
                <ProviderBadge provider={id.provider} username={id.email ?? id.displayName ?? ""} />
            ),
        },
        {
            key: "displayName",
            header: "Display Name",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-foreground",
            render: (id) => id.displayName || "-",
        },
        {
            key: "email",
            header: "Email",
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-(--ink-muted)",
            render: (id) => id.email || "-",
        },
        {
            key: "observedCount",
            header: "Events",
            headerClassName: "px-6 py-4 font-medium text-right",
            className: "px-6 py-4 text-right text-(--ink-muted)",
            render: (id) => id.observedCount || 0,
        },
    ];

    return (
        <div className="space-y-12">
            <section>
                <h2 className="text-xl font-semibold mb-2">
                    Unmapped Identities ({health.unmappedCount})
                </h2>
                <p className="text-sm text-(--ink-muted) mb-6">
                    These identities have been observed in events but are not mapped to any
                    canonical user.
                </p>
                <div className="rounded-xl border border-(--card-stroke) bg-card overflow-hidden">
                    <DataTable
                        accessibleLabel="Unmapped identities"
                        data={health.unmappedIdentities}
                        columns={columns}
                        rowKeyAction={(r) => (r as { email?: string | null }).email ?? ""}
                        emptyMessage="No unmapped identities."
                    />
                </div>
            </section>

            {health.suggestedAliases.length > 0 && (
                <section>
                    <h2 className="text-xl font-semibold mb-2">Suggested Aliases</h2>
                    <p className="text-sm text-(--ink-muted) mb-6">
                        Heuristic suggestions based on name/email similarity. Requires manual
                        confirmation.
                    </p>
                    <div className="rounded-xl border border-(--card-stroke) bg-card divide-y divide-(--card-stroke)">
                        {health.suggestedAliases.map((suggestion, idx) => (
                            <AliasSuggestionRow key={idx} suggestion={suggestion} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
