// A save or delete of the org's BYO config on the AI Setup page: cards that depend on it read it again.
export const BYO_LLM_CONFIG_CHANGED = "byo-llm-config-changed";

export function notifyByoLlmConfigChanged(): void {
    window.dispatchEvent(new Event(BYO_LLM_CONFIG_CHANGED));
}

export function onByoLlmConfigChanged(listener: () => void): () => void {
    window.addEventListener(BYO_LLM_CONFIG_CHANGED, listener);
    return () => window.removeEventListener(BYO_LLM_CONFIG_CHANGED, listener);
}
