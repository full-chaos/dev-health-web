"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { AskDevChat } from "@full-chaos/ask-dev/render";
import "@full-chaos/ask-dev/ask-dev.css";

import { useAskDevChatSource } from "./conversation/chatSource";

export type AskDevRenderProps = {
    /**
     * Runs once the render has mounted, after its own effects, with what held focus before them.
     * The composer takes focus as it mounts, so a host that does not want that puts it back.
     */
    readonly onMounted?: (focusBefore: Element | null) => void;
};

/**
 * Ask-dev's own render over web's store, on the panel, the sheet and `/dev` alike. Nothing of the
 * conversation is drawn on this side (CHAOS-12378). It scrolls inside itself, so its parent gives
 * it a definite height.
 */
export function AskDevRender({ onMounted }: AskDevRenderProps) {
    const source = useAskDevChatSource();
    const focusBefore = useRef<Element | null>(null);
    useLayoutEffect(() => {
        focusBefore.current = document.activeElement;
    }, []);
    useEffect(() => {
        onMounted?.(focusBefore.current);
    }, [onMounted]);
    return source === null ? null : <AskDevChat source={source} />;
}
