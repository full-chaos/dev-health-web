"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { FilterPills, type FilterPillOption } from "@/components/shared/FilterPills";
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
        [pathname, router, searchParams],
    );

    const options: FilterPillOption<RoleType>[] = ROLE_OPTIONS.map((role) => ({
        id: role,
        label: ROLE_CONFIGS[role].shortLabel,
        title: ROLE_CONFIGS[role].framing,
    }));

    return (
        <FilterPills
            options={options}
            value={activeRole}
            onChange={handleRoleChange}
            ariaLabel="Lens"
            leadingLabel="Lens"
            testId="role-selector"
            className={className}
        />
    );
}

export function useActiveRole(): RoleType {
    const searchParams = useSearchParams();
    const currentRole = searchParams.get("role");
    return isValidRole(currentRole) ? currentRole : DEFAULT_ROLE;
}
