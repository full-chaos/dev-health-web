"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { stopImpersonation } from "@/lib/admin/server";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
    broadcastImpersonationEvent,
    isImpersonationWindow,
    onImpersonationEvent,
} from "@/lib/impersonation-events";

export function ImpersonationBanner() {
    const { data: session, update } = useSession();
    const router = useRouter();
    const isImpersonating = !!session?.user?.is_impersonating;

    // Impersonation is per ADMIN USER server-side, so a start/stop in any tab
    // changes the effective org in EVERY tab. React to events from other tabs
    // by forcing the server-verified session re-poll immediately instead of
    // waiting for the 30s throttle (CHAOS-2347). The dedicated impersonation
    // tab closes itself when impersonation ends elsewhere.
    useEffect(() => {
        const syncSession = async () => {
            // next-auth's update() silently no-ops while a session fetch is
            // already in flight — retry once so the forced re-poll cannot be
            // dropped in the cross-tab race.
            const result = await update({ impersonationChanged: true });
            if (result === undefined) {
                await new Promise((resolve) => setTimeout(resolve, 1500));
                await update({ impersonationChanged: true });
            }
            router.refresh();
        };

        return onImpersonationEvent((event) => {
            if (event.type === "stopped" && isImpersonationWindow()) {
                window.close();
                if (window.closed) return;
                // Browser refused to close (restored/duplicated tab) — don't
                // strand the user on a route scoped to a stopped impersonation.
                router.push("/superadmin");
            }
            // Skip the re-poll when this tab already reflects the event (e.g.
            // next-auth's own cross-tab session sync got here first) — keeps
            // N-tab broadcast traffic bounded.
            if (isImpersonating === (event.type === "started")) return;
            void syncSession();
        });
    }, [update, router, isImpersonating]);

    if (!session?.user?.is_impersonating) {
        return null;
    }

    const handleStopImpersonation = async () => {
        const result = await stopImpersonation();
        if (result?.error) {
            toast.error(`Failed to stop impersonation: ${result.error}`);
            return;
        }
        // Force an immediate server-verified impersonation status re-poll so
        // org scoping reverts to the admin's own org right away (CHAOS-2309),
        // then tell every other tab to do the same.
        await update({ impersonationChanged: true });
        broadcastImpersonationEvent({ type: "stopped" });
        router.refresh();
        if (isImpersonationWindow()) {
            window.close();
            if (window.closed) return;
        }
        router.push("/superadmin");
    };

    return (
        <div className="w-full bg-amber-500 text-black px-4 py-3 text-center shadow-md flex items-center justify-center gap-4 z-[100] relative">
            <span className="font-medium">
                Viewing as {session.user.impersonated_email || session.user.impersonated_user_id}
            </span>
            <button
                type="button"
                onClick={handleStopImpersonation}
                className="bg-black/10 hover:bg-black/20 text-black px-3 py-1 rounded text-sm font-semibold transition-colors"
            >
                Stop Impersonating
            </button>
        </div>
    );
}
