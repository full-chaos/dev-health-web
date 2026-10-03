"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { gql, useQuery } from "urql";
import {
    DataHealthIdentityDocument,
    type DataHealthIdentityQuery,
    type DataHealthIdentityQueryVariables,
} from "@/lib/graphql/__generated__/graphql";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { buttonClassName } from "@/components/shared/Button";
import { DataState } from "@/components/ui/DataState";
import { RetryButton } from "@/components/ui/RetryButton";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { logger } from "@/lib/logger";
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

    if (fetching) return <DataState variant="loading" title="Loading identity gaps..." />;
    if (error) {
        // The failure goes to the log; the page says one plain sentence + Retry.
        logger.error({ err: error }, "Failed to load identity health");
        return (
            <DataState
                variant="error"
                title="Identity coverage unavailable"
                message="Identity coverage could not be loaded. Retry, or check again in a moment."
                action={<RetryButton />}
            />
        );
    }

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
        {
            key: "map",
            header: <span className="sr-only">Map identity</span>,
            headerClassName: "px-6 py-4 font-medium",
            className: "px-6 py-4 text-right",
            render: () => (
                <Link
                    href="/org/admin/identities/new"
                    className={`${buttonClassName("ghost", "sm")} px-0`}
                >
                    {CTA_LABELS.mapIdentity}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            <Section
                title={`Unmapped Identities (${health.unmappedCount})`}
                description="These identities have been observed in events but are not mapped to any canonical user."
            >
                <DataTable
                    accessibleLabel="Unmapped identities"
                    data={health.unmappedIdentities}
                    columns={columns}
                    rowKeyAction={(r) => (r as { email?: string | null }).email ?? ""}
                    emptyMessage="No unmapped identities."
                    footerNote="Events = events waiting for a mapping. The count shows which mapping matters most; it is not a measure of a person."
                />
            </Section>

            {health.suggestedAliases.length > 0 && (
                <Section
                    title="Suggested Aliases"
                    description="Heuristic suggestions based on name/email similarity. Requires manual confirmation."
                >
                    <div className="divide-y divide-(--card-stroke) rounded-(--radius-md) border border-(--card-stroke)">
                        {health.suggestedAliases.map((suggestion, idx) => (
                            <AliasSuggestionRow key={idx} suggestion={suggestion} />
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
}
