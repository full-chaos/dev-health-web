/**
 * Sign-out hook of the ACR browser token store (CHAOS-12096; Ask Dev direct-browser design §2.4,
 * item T4). Sign-out (`signOutEverywhere`) asks this hook for the ACR token family the browser
 * holds, revokes that family at ACR's revocation endpoint, then asks the hook to clear every tab.
 *
 * The store is T13's `src/lib/ask-dev/acr-auth.ts` (CHAOS-12305, c4). Both members work on every
 * page, not only after the Ask Dev panel has loaded:
 * - `heldFamily` is sync and reads the stored family directly (sessionStorage), whoever is signed
 *   in. It is null when no family is held, or when ACR advertised no revocation endpoint.
 * - `clearAllTabs` clears this tab (the family and the token in memory) and
 *   tells the origin's other tabs to clear theirs (BroadcastChannel `ask-dev:acr-tabs`).
 *
 * Every page imports this module (through `signOutEverywhere`), so its load starts the tab
 * listener: a tab that never used the store still clears on sign-out and still answers a cloned
 * tab. That sends no request (P1-6).
 *
 * Client code. No value here is logged; the refresh token leaves the browser only to ACR.
 */
import { clearAcrTokensInAllTabs, listenForAcrTabs, readAcrHeldFamily } from "./acr-auth";

/** The ACR token family this browser holds: what RFC 7009 revocation of it needs. */
export type AcrTokenFamily = {
    /** The first-party browser client's id (its client ID metadata document URL). */
    readonly clientId: string;
    /** The family's current refresh token. */
    readonly refreshToken: string;
    /** ACR's `revocation_endpoint` from its authorization server metadata. */
    readonly revocationEndpoint: string;
};

export type AcrSignOutHook = {
    /** The family this browser holds, or null when it holds none. */
    readonly heldFamily: () => AcrTokenFamily | null;
    /** Clears the ACR token state of this tab and of every other tab of this origin. */
    readonly clearAllTabs: () => void | Promise<void>;
};

/** The browser's ACR token store, for sign-out (CHAOS-12305). */
export const acrBrowserSignOut: AcrSignOutHook = {
    clearAllTabs: () => clearAcrTokensInAllTabs(),
    heldFamily: () => {
        const family = readAcrHeldFamily();
        if (family === null || family.revocationEndpoint === null) return null;
        return {
            clientId: family.clientId,
            refreshToken: family.refreshToken,
            revocationEndpoint: family.revocationEndpoint,
        };
    },
};

// Every page loads this module: listen from here, so the tab clears on sign-out and answers a
// clone even when it never used the store (CHAOS-12305). A channel, not a request.
if (typeof window !== "undefined") listenForAcrTabs();
