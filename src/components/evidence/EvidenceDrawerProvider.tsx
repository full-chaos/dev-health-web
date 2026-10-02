"use client";

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type RefObject,
} from "react";
import { usePathname } from "next/navigation";

import type { MetricFilter } from "@/lib/filters/types";

import { EvidenceDrawerShell } from "./EvidenceDrawerShell";
import { EvidencePanel } from "./EvidencePanel";

type SubjectBase = {
    /** The signal, metric, dot, row or cell the evidence is about. Shown as the heading in the drawer body. */
    title: string;
    /**
     * Called when the user closes the drawer, or when another subject replaces this one, so the
     * opener can clear its selection. Not called when a navigation drops the subject (the opener
     * leaves the page then). A server page cannot pass it.
     */
    onClose?: () => void;
};

/** A subject the panel loads: an explain metric or a served `evidence_ref`. */
export type EvidenceRequestSubject = SubjectBase & {
    /** A served `evidence_ref`. It wins over `metric` (see `EvidencePanel`). */
    apiUrl?: string;
    metric?: string;
    /** The active scope and window. The panel sends them with the request. */
    filters: MetricFilter;
    /** The active lens role. The footer link keeps it. */
    role?: string;
    /**
     * A return-path hint for the footer link: it is added to that link as the `origin` query
     * parameter, so the destination can lead back to the opener's view. Without it the link is
     * the plain destination.
     */
    origin?: string;
    /**
     * Content the opener already has for this subject (for example a signal's served "why it
     * matters" and "recommended action"). Shown first in the body, above the loaded evidence, and
     * also while the request loads or fails. The panel does not change it.
     */
    intro?: ReactNode;
};

/**
 * A subject that brings its own body (a quadrant dot, a heatmap cell, a table row). The body is
 * mounted when the drawer opens, so a body that loads data does it on mount.
 */
export type EvidenceContentSubject = SubjectBase & {
    content: ReactNode;
    footer?: ReactNode;
    /**
     * Gets focus when the drawer closes. Pass it when the opener is not a focusable element (a
     * mark on a chart canvas): the chart region then gets focus back. Default: the element that
     * had focus when the drawer opened (the button that opened it).
     */
    returnFocusRef?: RefObject<HTMLElement | null>;
};

/** What the drawer explains. */
export type EvidenceSubject = EvidenceRequestSubject | EvidenceContentSubject;

export type EvidenceDrawerApi = {
    /** Opens the shared drawer for this subject. A second call replaces the subject. */
    open: (subject: EvidenceSubject) => void;
    close: () => void;
};

const EvidenceDrawerContext = createContext<EvidenceDrawerApi | null>(null);

type OpenState = { subject: EvidenceSubject; path: string | null; id: number };

const hasContent = (subject: EvidenceSubject): subject is EvidenceContentSubject =>
    "content" in subject;

/**
 * Owns the ONE "Evidence & Context" drawer of the authed app. It is mounted in the `(app)` layout,
 * so a page header action, a card, a chart dot, a heatmap cell and a table row all open the same
 * drawer through `useEvidenceDrawer()`.
 *
 * The layout does not unmount on a client navigation, so the drawer is open only for the path it
 * was opened on: a navigation drops the subject.
 */
export function EvidenceDrawerProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [state, setState] = useState<OpenState | null>(null);
    // The open subject and a counter, for the event handlers only (never read during render).
    const current = useRef<{ subject: EvidenceSubject | null; id: number }>({
        subject: null,
        id: 0,
    });

    // Drop the subject of another path during render (no effect, no extra paint). React renders
    // again before it commits, so the drawer is never shown on another path, and it does not
    // open again when the user comes back to the path.
    if (state !== null && state.path !== pathname) {
        setState(null);
    }

    const open = useCallback(
        (subject: EvidenceSubject) => {
            const previous = current.current.subject;
            if (previous !== null && previous !== subject) previous.onClose?.();
            const id = current.current.id + 1;
            current.current = { subject, id };
            setState({ subject, path: pathname, id });
        },
        [pathname],
    );
    const close = useCallback(() => {
        const previous = current.current.subject;
        current.current = { subject: null, id: current.current.id };
        previous?.onClose?.();
        setState(null);
    }, []);
    const api = useMemo(() => ({ open, close }), [open, close]);

    const subject = state?.subject ?? null;

    return (
        <EvidenceDrawerContext.Provider value={api}>
            {children}
            {state === null || subject === null ? null : hasContent(subject) ? (
                // The key gives each open a fresh body (no state of the subject before it).
                <EvidenceDrawerShell
                    key={state.id}
                    subject={subject.title}
                    onCloseAction={close}
                    footer={subject.footer}
                    returnFocusRef={subject.returnFocusRef}
                >
                    {subject.content}
                </EvidenceDrawerShell>
            ) : (
                <EvidencePanel
                    key={state.id}
                    isOpen
                    onCloseAction={close}
                    title={subject.title}
                    apiUrl={subject.apiUrl}
                    metric={subject.metric}
                    filters={subject.filters}
                    role={subject.role}
                    origin={subject.origin}
                    intro={subject.intro}
                />
            )}
        </EvidenceDrawerContext.Provider>
    );
}

/**
 * The shared evidence drawer. It throws outside `EvidenceDrawerProvider`: a silent fallback would
 * leave an evidence button that does nothing.
 */
export function useEvidenceDrawer(): EvidenceDrawerApi {
    const api = useContext(EvidenceDrawerContext);
    if (!api) {
        throw new Error("useEvidenceDrawer must be used inside EvidenceDrawerProvider");
    }
    return api;
}
