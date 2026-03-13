import React from "react";
import Link from "next/link";
import { ProviderBadge } from "./ProviderBadge";

export type Identity = {
  canonical_id: string;
  display_name: string | null;
  email: string | null;
  team_ids: string[];
  provider_identities: Record<string, string[]>;
};

type IdentityTableProps = {
  identities: Identity[];
  onDelete?: (id: string) => void;
};

export function IdentityTable({ identities, onDelete }: IdentityTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-(--card-stroke) bg-(--card-80)">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-(--card-stroke) bg-(--card-70) text-(--ink-muted)">
          <tr>
            <th className="px-6 py-4 font-medium">Canonical ID</th>
            <th className="px-6 py-4 font-medium">Display Name</th>
            <th className="px-6 py-4 font-medium">Email</th>
            <th className="px-6 py-4 font-medium">Team</th>
            <th className="px-6 py-4 font-medium">Provider Identities</th>
            <th className="px-6 py-4 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-(--card-stroke)">
          {identities.map((identity) => {
            const teamIds = identity.team_ids ?? [];
            const providerIdentities = identity.provider_identities ?? {};

            return (
            <tr key={identity.canonical_id} className="hover:bg-(--card-70)/50">
              <td className="px-6 py-4 font-medium text-foreground">
                <Link
                  href={`/admin/identities/${identity.canonical_id}/edit`}
                  className="hover:underline"
                >
                  {identity.canonical_id}
                </Link>
              </td>
              <td className="px-6 py-4 text-(--ink-muted)">{identity.display_name ?? "—"}</td>
              <td className="px-6 py-4 text-(--ink-muted)">{identity.email ?? "—"}</td>
              <td className="px-6 py-4 text-(--ink-muted)">
                {teamIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {teamIds.map((teamId) => (
                      <Link
                        key={teamId}
                        href={`/admin/teams/${teamId}/edit`}
                        className="text-(--accent) hover:underline"
                      >
                        {teamId}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <span className="text-(--ink-muted)/50">Unassigned</span>
                )}
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(providerIdentities).map(([provider, usernames]) =>
                    usernames.map((username) => (
                      <ProviderBadge
                        key={`${identity.canonical_id}-${provider}-${username}`}
                        provider={provider}
                        username={username}
                      />
                    ))
                  )}
                </div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-3">
                  <Link
                    href={`/admin/identities/${identity.canonical_id}/edit`}
                    className="text-(--accent) hover:underline"
                  >
                    Edit
                  </Link>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(identity.canonical_id)}
                      className="text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
            );
          })}
          {identities.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-8 text-center text-(--ink-muted)">
                No identities found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
