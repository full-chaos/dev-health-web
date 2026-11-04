"use client";

import type { ReactNode } from "react";

import { useAdminNav } from "@/components/admin/AdminTabs";

/** Renders nothing for a limited session (AUTHZ_PLATFORM_UI=enforce); else its children. */
export function HideWhileImpersonationLimited({ children }: { children: ReactNode }) {
    const { impersonationLimited } = useAdminNav();
    return impersonationLimited ? null : <>{children}</>;
}
