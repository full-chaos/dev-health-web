import React from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { IdentityTable, Identity } from "@/components/admin/identities/IdentityTable";

// Mock data
const MOCK_IDENTITIES: Identity[] = [
  {
    canonical_id: "alice-smith",
    display_name: "Alice Smith",
    email: "alice@example.com",
    team_id: "platform-eng",
    provider_identities: [
      { provider: "github", username: "alicesmith" },
      { provider: "jira", username: "asmith" },
    ],
  },
  {
    canonical_id: "bob-jones",
    display_name: "Bob Jones",
    email: "bob@example.com",
    team_id: "product-a",
    provider_identities: [
      { provider: "gitlab", username: "bobjones" },
      { provider: "email", username: "bob@example.com" },
    ],
  },
  {
    canonical_id: "charlie-brown",
    display_name: "Charlie Brown",
    email: "charlie@example.com",
    provider_identities: [
      { provider: "github", username: "cbrown" },
    ],
  },
];

export default function IdentitiesPage() {
  return (
    <div>
      <AdminHeader
        title="Identities"
        description="Manage developer identities and map them to teams."
      >
        <Link
          href="/admin/identities/new"
          className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90"
        >
          Add Identity
        </Link>
      </AdminHeader>

      <div className="mb-6 flex gap-4">
        <input
          type="text"
          placeholder="Search identities..."
          className="w-full max-w-sm rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm text-foreground focus:border-(--accent) focus:outline-none focus:ring-1 focus:ring-(--accent)"
        />
      </div>

      <IdentityTable identities={MOCK_IDENTITIES} />
    </div>
  );
}
