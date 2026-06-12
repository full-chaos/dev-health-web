"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { startImpersonation } from "@/lib/admin/server";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { User } from "@/lib/admin/types";
import { broadcastImpersonationEvent, openImpersonationWindow } from "@/lib/impersonation-events";

export function ImpersonateUserButton({ user }: { user: User }) {
    const { data: session, update } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    // Impersonation is a superuser-only capability on the backend
    // (start_impersonation 403s non-superusers, ImpersonationMiddleware skips
    // them). Gate the button on the ACTOR being a superuser so non-superuser
    // admins are not offered an action that always fails (CHAOS-2303).
    const canImpersonate =
        !!session?.user?.is_superuser &&
        session?.user?.id !== user.id &&
        !user.is_superuser &&
        user.role !== "admin";

    if (!canImpersonate) {
        return null;
    }

    const handleImpersonate = async () => {
        setLoading(true);
        // Open the impersonation tab synchronously, before any await — popup
        // blockers do not reliably honor window.open after a network
        // round-trip. Null (blocked) falls back to same-tab navigation.
        const impersonationWindow = openImpersonationWindow();
        try {
            const result = await startImpersonation(user.id);
            if (result.error) {
                impersonationWindow?.close();
                toast.error(result.error);
                return;
            }
            if (result.data) {
                // Force an immediate server-verified impersonation status re-poll
                // so org scoping switches to the target org without waiting for
                // the 30s JWT poll interval (CHAOS-2309).
                await update({ impersonationChanged: true });
                broadcastImpersonationEvent({ type: "started" });
                router.refresh();
                if (impersonationWindow && !impersonationWindow.closed) {
                    impersonationWindow.location.href = "/dashboard";
                    impersonationWindow.focus();
                } else {
                    router.push("/dashboard");
                }
            } else {
                impersonationWindow?.close();
            }
        } catch {
            impersonationWindow?.close();
            toast.error("Failed to start impersonation");
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleImpersonate}
            disabled={loading}
            className="block w-full rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-500 hover:bg-amber-500/20 text-left transition-colors disabled:opacity-50"
        >
            {loading ? "Impersonating…" : "Impersonate User"}
        </button>
    );
}
