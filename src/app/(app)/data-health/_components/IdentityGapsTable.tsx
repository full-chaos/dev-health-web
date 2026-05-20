"use client";

import { useQuery } from "urql";
import { DataHealthIdentityDocument } from "@/lib/graphql/__generated__/graphql";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { ProviderBadge } from "@/components/admin/identities/ProviderBadge";
import { useState } from "react";
import { AliasSuggestionRow } from "./AliasSuggestionRow";

export function IdentityGapsTable() {
  const [result] = useQuery({
    query: DataHealthIdentityDocument,
    variables: { team: "ALL" }, // Or context
  });

  const { data, fetching, error } = result;

  if (fetching) return <div className="p-4 text-(--ink-muted)">Loading identity gaps...</div>;
  if (error) return <div className="p-4 text-(--accent-negative)">Error: {error.message}</div>;

  const health = data?.dataHealth?.identityMapping;
  if (!health) return null;

  const columns: DataTableColumn<any>[] = [
    {
      key: "provider",
      header: "Provider",
      headerClassName: "px-6 py-4 font-medium",
      className: "px-6 py-4",
      render: (id) => <ProviderBadge provider={id.provider} />,
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
        <h2 className="text-xl font-semibold mb-2">Unmapped Identities ({health.unmappedCount})</h2>
        <p className="text-sm text-(--ink-muted) mb-6">
          These identities have been observed in events but are not mapped to any canonical user.
        </p>
        <div className="rounded-xl border border-(--card-stroke) bg-card overflow-hidden">
          <DataTable data={health.unmappedIdentities} columns={columns} keyField="email" />
        </div>
      </section>

      {health.suggestedAliases.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-2">Suggested Aliases</h2>
          <p className="text-sm text-(--ink-muted) mb-6">
            Heuristic suggestions based on name/email similarity. Requires manual confirmation.
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
