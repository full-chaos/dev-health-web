import React from "react";
import Link from "next/link";
import { ProviderBadge } from "./ProviderBadge";

export type ProviderIdentity = {
  provider: string;
  username: string;
};

export type Identity = {
  canonical_id: string;
  display_name: string;
  email: string;
  team_id?: string;
  provider_identities: ProviderIdentity[];
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
          {identities.map((identity) => (
            <tr key={identity.canonical_id} className="hover:bg-(--card-70)/50">
              <td className="px-6 py-4 font-medium text-foreground">
                <Link
                  href={`/admin/identities/${identity.canonical_id}/edit`}
                  className="hover:underline"
                >
                  {identity.canonical_id}
                </Link>
              </td>
              <td className="px-6 py-4 text-(--ink-muted)">{identity.display_name}</td>
              <td className="px-6 py-4 text-(--ink-muted)">{identity.email}</td>
              <td className="px-6 py-4 text-(--ink-muted)">
                {identity.team_id ? (
                  <Link
                    href={`/admin/teams/${identity.team_id}/edit`}
                    className="text-(--accent) hover:underline"
                  >
                    {identity.team_id}
                  </Link>
                ) : (
                  <span className="text-(--ink-muted)/50">Unassigned</span>
                )}
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-wrap gap-2">
                  {identity.provider_identities.map((pid, i) => (
                    <ProviderBadge key={i} provider={pid.provider} username={pid.username} />
                  ))}
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
                      onClick={() => onDelete(identity.canonical_id)}
                      className="text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
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
