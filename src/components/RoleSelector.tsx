"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import {
    type RoleType,
    ROLE_CONFIGS,
    ROLE_OPTIONS,
    DEFAULT_ROLE,
    isValidRole,
} from "@/lib/roleContext";

type RoleSelectorProps = {
    className?: string;
};

export function RoleSelector({ className }: RoleSelectorProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const currentRole = searchParams.get("role");
    const activeRole: RoleType = isValidRole(currentRole) ? currentRole : DEFAULT_ROLE;

    const handleRoleChange = useCallback(
        (role: RoleType) => {
            const params = new URLSearchParams(searchParams.toString());
            if (role === DEFAULT_ROLE) {
                params.delete("role");
            } else {
                params.set("role", role);
            }
            const queryString = params.toString();
            const url = queryString ? `${pathname}?${queryString}` : pathname;
            router.push(url, { scroll: false });
        },
        [pathname, router, searchParams]
    );

    return (
        <div
            className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}
            data-testid="role-selector"
        >
            <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--ink-muted)]">
                Start from
            </span>
            <div className="flex flex-wrap gap-1">
                {ROLE_OPTIONS.map((role) => {
                    const config = ROLE_CONFIGS[role];
                    const isActive = role === activeRole;
                    return (
                        <button
                            key={role}
                            type="button"
                            onClick={() => handleRoleChange(role)}
                            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] transition ${isActive
                                    ? "border-[var(--accent-2)] bg-[var(--accent-2)]/15 text-[var(--accent-2)]"
                                    : "border-[var(--card-stroke)] bg-[var(--card-80)] text-[var(--ink-muted)] hover:border-[var(--accent-2)]/40 hover:text-[var(--foreground)]"
                                }`}
                            aria-pressed={isActive}
                            title={config.framing}
                        >
                            {config.shortLabel}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function useActiveRole(): RoleType {
    const searchParams = useSearchParams();
    const currentRole = searchParams.get("role");
    return isValidRole(currentRole) ? currentRole : DEFAULT_ROLE;
}
