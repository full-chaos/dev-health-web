/**
 * What this tab keeps of its Ask Dev conversation in session storage, and the one place that
 * names the keys: the restore hint (E6 design v5 §4.4) and the unsaved-conversation marker
 * (CHAOS-11934, CHAOS-12503). The conversation store and its provider write and read them;
 * sign-out forgets them (CHAOS-12575, CHAOS-12605). A small module of its own, so sign-out, which
 * every page loads, does not load the store.
 */

/** Session storage: the hint of this tab's current conversation. */
export const THREAD_HINT_KEY = "ask-dev:thread";

/**
 * CHAOS-11934 (plan §2.5): conversations live in this tab's memory until Phase 4 (E6) stores them,
 * so a reload loses one. This session-storage marker lets the reloaded tab say so: it holds a tag
 * of the (org, principal) whose conversation had a turn, never a question, an answer or an id.
 */
export const UNSAVED_CONVERSATION_KEY = "ask-dev:unsaved-conversation";

/**
 * The browser-minted thread id of that conversation while ACR does not hold it (CHAOS-12503), and
 * nothing else: the id the URL already shows. Admission removes it. A 404 for this id is this tab's
 * own unsaved conversation. A 404 for any other id stays "not available".
 */
export const UNSAVED_THREAD_KEY = "ask-dev:unsaved-thread";

/**
 * Sign-out step 3: removes this tab's restore hint (CHAOS-12575) and its unsaved-conversation
 * marker (CHAOS-12605). Left in place, the same user's next session restored a conversation it had
 * no token to read ("This conversation could not be read", with the composer disabled), or said a
 * reload had started a new conversation when the user had signed out and in. Each key is removed
 * on its own, so one that fails keeps none of the others (codex r1 on #1751). Throws the first
 * failure when the storage, or a key, cannot be used; sign-out logs it.
 */
export function forgetTabConversation(): void {
    const storage = window.sessionStorage;
    const failures: unknown[] = [];
    for (const key of [THREAD_HINT_KEY, UNSAVED_CONVERSATION_KEY, UNSAVED_THREAD_KEY]) {
        try {
            storage.removeItem(key);
        } catch (error) {
            failures.push(error);
        }
    }
    if (failures.length > 0) throw failures[0];
}
