"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState, useTransition } from "react";

type OrganizationOption = {
  id: string;
  slug: string;
  name: string;
  tier?: string | null;
  role: string;
  joined_at?: string | null;
  has_data: boolean;
  last_metrics_at?: string | null;
};

type OrganizationsResponse = {
  active_org_id?: string | null;
  organizations: OrganizationOption[];
};

type SwitchOrgResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    org_id?: string | null;
    role?: string;
    is_superuser?: boolean;
  };
};

function dataLabel(org: OrganizationOption) {
  if (!org.has_data) return "No data yet";
  if (!org.last_metrics_at) return "Has data";
  return `Data through ${new Date(org.last_metrics_at).toLocaleDateString()}`;
}

export function OrgSwitcher() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [state, setState] = useState<OrganizationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let ignore = false;
    async function loadOrganizations() {
      try {
        const response = await fetch("/api/auth/organizations", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as OrganizationsResponse;
        if (!ignore) setState(data);
      } catch {
        if (!ignore) setError("Could not load organizations");
      }
    }
    loadOrganizations();
    return () => {
      ignore = true;
    };
  }, []);

  const activeOrgId = state?.active_org_id ?? session?.user?.org_id ?? "";
  const activeOrg = useMemo(
    () => state?.organizations.find((org) => org.id === activeOrgId),
    [activeOrgId, state?.organizations]
  );

  if (!state || state.organizations.length <= 1) {
    return null;
  }

  async function switchOrg(orgId: string) {
    if (!orgId || orgId === activeOrgId || isPending) return;
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId }),
      });
      if (!response.ok) {
        setError("Could not switch organization");
        return;
      }
      const data = (await response.json()) as SwitchOrgResponse;
      await update({ activeOrg: data });
      setState((current) => current ? { ...current, active_org_id: data.user.org_id ?? orgId } : current);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 rounded-2xl border border-(--card-stroke) bg-(--card-70) p-3">
      <label htmlFor="org-switcher" className="text-[10px] uppercase tracking-widest text-(--ink-muted)">
        Organization
      </label>
      <select
        id="org-switcher"
        value={activeOrgId}
        disabled={isPending}
        onChange={(event) => switchOrg(event.target.value)}
        className="mt-2 w-full rounded-xl border border-(--card-stroke) bg-(--background) px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent) disabled:opacity-60"
        aria-describedby="org-switcher-data"
      >
        {state.organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name} {org.has_data ? "• data" : "• empty"}
          </option>
        ))}
      </select>
      <p id="org-switcher-data" className="mt-2 text-[11px] text-(--ink-muted)">
        {activeOrg ? dataLabel(activeOrg) : "Choose the organization used for dashboards."}
      </p>
      {error ? <p className="mt-2 text-[11px] text-red-400">{error}</p> : null}
    </div>
  );
}
