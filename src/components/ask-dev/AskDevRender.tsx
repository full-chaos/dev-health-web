"use client";

import { AskDevChat } from "@full-chaos/ask-dev/render";
import "@full-chaos/ask-dev/ask-dev.css";

import { useAskDevChatSource } from "./conversation/chatSource";

/**
 * Ask-dev's own render over web's store, on the panel, the sheet and `/dev` alike. Nothing of the
 * conversation is drawn on this side (CHAOS-12378). It scrolls inside itself, so its parent gives
 * it a definite height.
 */
export function AskDevRender() {
    const source = useAskDevChatSource();
    return source === null ? null : <AskDevChat source={source} />;
}
