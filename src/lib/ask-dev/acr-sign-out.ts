/**
 * Sign-out hook of the ACR browser token store (CHAOS-12096; Ask Dev direct-browser design §2.4,
 * item T4). Sign-out (`signOutEverywhere`) asks this hook for the ACR token family the browser
 * holds, revokes that family at ACR's revocation endpoint, then asks the hook to clear every tab.
 *
 * The store itself is item T13 (CHAOS-12103, `src/lib/ask-dev/acr-auth.ts`). Until it lands, the
 * browser holds no ACR token: `heldFamily` returns null (step 2 sends nothing) and there is nothing
 * to clear. T13 replaces `acrBrowserSignOut` with its store, and must keep both members working on
 * every page, not only after the Ask Dev panel has loaded: `heldFamily` reads the stored family
 * directly (sessionStorage), and `clearAllTabs` clears this tab and tells the other tabs of the
 * origin to clear theirs (BroadcastChannel).
 *
 * Client code. No value here is logged; the refresh token leaves the browser only to ACR.
 */

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

/** No ACR token store yet (T13): no family is held and there is no token state to clear. */
export const acrBrowserSignOut: AcrSignOutHook = {
    clearAllTabs: () => undefined,
    heldFamily: () => null,
};
