/**
 * This tab's Ask Dev restore hint (E6 design v5 §4.4): the conversation the tab shows, kept in
 * session storage so a reload restores it. The conversation store writes and reads it; sign-out
 * forgets it (CHAOS-12575). A small module of its own, so sign-out, which every page loads, does
 * not load the store.
 */

/** Session storage: the hint of this tab's current conversation. */
export const THREAD_HINT_KEY = "ask-dev:thread";

/**
 * Sign-out step 3 (CHAOS-12575): removes this tab's restore hint. Left in place, the same user's
 * next session restored a conversation it had no token to read: "This conversation could not be
 * read", with the composer disabled. Throws when the storage cannot be used; sign-out logs it.
 */
export function forgetThreadHint(): void {
    window.sessionStorage.removeItem(THREAD_HINT_KEY);
}
