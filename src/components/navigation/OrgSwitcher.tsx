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

/**
 * The data line of the account block: what the active organization's data state is. `undefined`
 * (not loaded yet) shows nothing; `null` (not known) says so and is never read as "no data".
 */
export function describeOrganizationData(
    organization: ActiveOrganizationData | null | undefined,
): string | null {
    if (organization === undefined) return null;
    if (organization === null) return "Data status unavailable";
    if (!organization.hasData) return "No data yet";
    if (!organization.lastMetricsAt) return "Has data";
    return `Data through ${new Date(organization.lastMetricsAt).toLocaleDateString()}`;
}

/** Data state of the active organization, as the switcher shows it. */
export type ActiveOrganizationData = {
    name: string;
    hasData: boolean;
    lastMetricsAt: string | null;
};

type OrgSwitcherProps = {
    /**
     * Reports the active organization's data state after the list loads and
     * after a switch. `null` means it is not known: the request failed, or the
     * active organization is not in the list.
     */
    onActiveOrganizationChange?: (organization: ActiveOrganizationData | null) => void;
};

// The workspace card of the shared app shell, drawn as the prototype's `.workspace`: a bordered
// initials mark, the organization name (the select), and one line under it. The old "panel" look of
// the page navigation and the admin sidebar went with them (CHAOS-7751, CHAOS-7965).
const CLASSES = {
    container: "flex items-center gap-2.5 rounded-(--radius-sm) bg-(--surface-raised) p-2.5",
    mark: "grid size-8 shrink-0 place-items-center rounded-(--radius-sm) border border-(--border) bg-(--surface) text-xs font-semibold text-(--text-secondary)",
    label: "sr-only",
    select: "w-full min-w-0 cursor-pointer truncate rounded-(--radius-sm) border-0 bg-transparent p-0 text-[0.8125rem] font-semibold text-(--text-primary) outline-none transition focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:cursor-default disabled:opacity-100",
    note: "mt-0.5 text-[0.6875rem] leading-snug text-(--text-muted)",
} as const;

/** Up to two initials of an organization name, for the workspace mark. */
function initialsOf(name: string | undefined): string {
    const words = (name ?? "").trim().split(/\s+/u).filter(Boolean);
    if (words.length === 0) return "–";
    return words
        .slice(0, 2)
        .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
        .join("");
}

export function OrgSwitcher({ onActiveOrganizationChange }: OrgSwitcherProps = {}) {
    const classes = CLASSES;
    const router = useRouter();
    const { data: session, update } = useSession();
    const [state, setState] = useState<OrganizationsResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let ignore = false;
        async function loadOrganizations() {
            try {
                const response = await fetch("/api/auth/organizations", { cache: "no-store" });
                if (!response.ok) {
                    if (!ignore) setLoadFailed(true);
                    return;
                }
                const data = (await response.json()) as OrganizationsResponse;
                if (!ignore) setState(data);
            } catch {
                if (!ignore) {
                    setLoadFailed(true);
                    setError("Could not load organizations");
                }
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
        [activeOrgId, state?.organizations],
    );

    // Tell the owner what this card shows, so a second surface (the shell's
    // status chip) states the same thing and never a different one.
    useEffect(() => {
        if (!onActiveOrganizationChange) return;
        if (loadFailed) {
            onActiveOrganizationChange(null);
            return;
        }
        if (!state) return;
        onActiveOrganizationChange(
            activeOrg
                ? {
                      name: activeOrg.name,
                      hasData: activeOrg.has_data,
                      lastMetricsAt: activeOrg.last_metrics_at ?? null,
                  }
                : null,
        );
    }, [activeOrg, loadFailed, onActiveOrganizationChange, state]);

    if (!state || state.organizations.length === 0) {
        return null;
    }

    const canSwitchOrganizations = state.organizations.length > 1;

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
            setState((current) =>
                current ? { ...current, active_org_id: data.user.org_id ?? orgId } : current,
            );
            router.refresh();
        });
    }

    return (
        <div className={classes.container}>
            <span aria-hidden="true" data-testid="org-mark" className={classes.mark}>
                {initialsOf(activeOrg?.name)}
            </span>
            <div className="min-w-0 flex-1">
                <label htmlFor="org-switcher" className={classes.label}>
                    {canSwitchOrganizations ? "Organization" : "Current organization"}
                </label>
                <select
                    id="org-switcher"
                    value={activeOrgId}
                    disabled={isPending || !canSwitchOrganizations}
                    onChange={(event) => switchOrg(event.target.value)}
                    className={classes.select}
                    aria-describedby="org-switcher-data"
                >
                    {state.organizations.map((org) => (
                        <option key={org.id} value={org.id}>
                            {org.name}
                        </option>
                    ))}
                </select>
                <p id="org-switcher-data" className={classes.note}>
                    {canSwitchOrganizations
                        ? "Organization workspace"
                        : "Organization workspace · only one on this account"}
                </p>
                {error ? <p className="mt-1 text-xs text-(--negative)">{error}</p> : null}
            </div>
        </div>
    );
}
