"use client";

import { Suspense } from "react";
import { RoleSelector as RoleSelectorBase } from "./RoleSelector";
import { getRoleConfig, type RoleType, isValidRole, DEFAULT_ROLE } from "@/lib/roleContext";
import { useSearchParams } from "next/navigation";

function RoleSelectorInner({ className }: { className?: string }) {
    return <RoleSelectorBase className={className} />;
}

export function RoleSelectorWithSuspense({ className }: { className?: string }) {
    return (
        <Suspense
            fallback={
                <div className={`flex items-center gap-2 ${className ?? ""}`}>
                    <span className="text-[10px] uppercase tracking-[0.25em] text-[var(--ink-muted)]">
                        Start from
                    </span>
                    <div className="flex gap-1">
                        {["IC", "EM", "PM", "Leadership"].map((label) => (
                            <span
                                key={label}
                                className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-80)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-[var(--ink-muted)]"
                            >
                                {label}
                            </span>
                        ))}
                    </div>
                </div>
            }
        >
            <RoleSelectorInner className={className} />
        </Suspense>
    );
}

function RoleFramingInner() {
    const searchParams = useSearchParams();
    const currentRole = searchParams.get("role");
    const role: RoleType = isValidRole(currentRole) ? currentRole : DEFAULT_ROLE;
    const config = getRoleConfig(role);

    return (
        <p
            className="mt-1 text-xs text-[var(--accent-2)]/80"
            data-testid="role-framing"
        >
            {config.framing}
        </p>
    );
}

export function RoleFraming() {
    return (
        <Suspense fallback={<p className="mt-1 text-xs text-[var(--accent-2)]/80">How work is scoped, reviewed, and flows</p>}>
            <RoleFramingInner />
        </Suspense>
    );
}
