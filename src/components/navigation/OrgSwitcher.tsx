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

/** Data state of the active organization, as the switcher shows it. */
export type ActiveOrganizationData = {
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
    /**
     * `panel` is the legacy look inside `PrimaryNav` / `AdminSidebar`. `card` is
     * the workspace card of the shared app shell. Behaviour is the same.
     */
    variant?: "panel" | "card";
};

const VARIANT_CLASSES = {
    panel: {
        container: "mt-4 rounded-2xl border border-(--card-stroke) bg-(--card-70) p-3",
        label: "text-label-caps uppercase tracking-widest text-(--ink-muted)",
        select: "mt-2 w-full rounded-xl border border-(--card-stroke) bg-(--background) px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent) disabled:opacity-60",
        note: "mt-2 text-xs text-(--ink-muted)",
    },
    card: {
        container: "rounded-(--radius-sm) border border-(--border) bg-(--surface-raised) p-3",
        label: "text-label-caps uppercase text-(--text-muted)",
        select: "mt-2 w-full rounded-(--radius-sm) border border-(--border) bg-(--surface) px-3 py-2 text-sm text-(--text-primary) outline-none transition focus:border-(--accent-2) disabled:opacity-60",
        note: "mt-2 text-xs text-(--text-secondary)",
    },
} as const;

export function OrgSwitcher({
    variant = "panel",
    onActiveOrganizationChange,
}: OrgSwitcherProps = {}) {
    const classes = VARIANT_CLASSES[variant];
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
        <div className={classes.container} data-variant={variant}>
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
                        {org.name} {org.has_data ? "• data" : "• empty"}
                    </option>
                ))}
            </select>
            <p id="org-switcher-data" className={classes.note}>
                {activeOrg ? dataLabel(activeOrg) : "Choose the organization used for dashboards."}
                {!canSwitchOrganizations ? " · Only organization on this account" : null}
            </p>
            {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
        </div>
    );
}
