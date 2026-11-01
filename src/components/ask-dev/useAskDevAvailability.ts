"use client";

import { useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";

import { useAdminTier } from "@/components/admin/AdminTierContext";
import { browserAcrClientConfig } from "@/lib/ask-dev/acr-browser-config";
import { isAskDevEnabled } from "@/lib/ask-dev/surface";

/**
 * Whether this tab may show Ask Dev (CHAOS-12306, decision 6):
 * - `off`: an Ask Dev entitlement is off (the rule before CHAOS-12306);
 * - `impersonating`: the browser ACR client is on and the session is impersonating. The browser
 *   holds no ACR token for that session (`acr-auth.ts`), so Ask Dev is hidden;
 * - `loading`: the browser ACR client is on and no session is known yet. Hidden, so the launcher
 *   never flashes for an impersonating admin. A refetch keeps its last session: no flash either;
 * - `on`: otherwise.
 *
 * With the browser ACR client off (prod until the T13 roll) it is only `on` or `off`, as before.
 * The launcher, the panel, the shell's open state and shortcut, and the palette entry show only
 * on `on`. It reads only the session the provider already holds: it sends no request (P1-6).
 */
export type AskDevAvailability = "on" | "off" | "impersonating" | "loading";

const noSubscription = () => () => undefined;
const clientOn = () => browserAcrClientConfig() !== undefined;
// The server cannot read the browser's runtime config: it renders "client off", and so does the
// hydration render, so the two match. The client value applies right after hydration.
const clientOffOnServer = () => false;

export function useAskDevAvailability(): AskDevAvailability {
    const { features } = useAdminTier();
    const acrClient = useSyncExternalStore(noSubscription, clientOn, clientOffOnServer);
    const { data: session, status } = useSession();
    if (!isAskDevEnabled(features)) return "off";
    if (!acrClient) return "on";
    const user = session?.user;
    if (user?.is_impersonating) return "impersonating";
    if (status === "loading" && !user) return "loading";
    return "on";
}
