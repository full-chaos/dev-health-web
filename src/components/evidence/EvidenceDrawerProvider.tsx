"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { MetricFilter } from "@/lib/filters/types";

import { EvidencePanel } from "./EvidencePanel";

/** What the drawer explains. The fields are the same as the `EvidencePanel` props. */
export type EvidenceSubject = {
    /** The signal, metric or card the evidence is about. Shown as the heading in the drawer body. */
    title: string;
    /** A served `evidence_ref`. It wins over `metric` (see `EvidencePanel`). */
    apiUrl?: string;
    metric?: string;
    /** The active scope and window. The panel sends them with the request. */
    filters: MetricFilter;
};

export type EvidenceDrawerApi = {
    /** Opens the shared drawer for this subject. A second call replaces the subject. */
    open: (subject: EvidenceSubject) => void;
    close: () => void;
};

const EvidenceDrawerContext = createContext<EvidenceDrawerApi | null>(null);

type OpenState = { subject: EvidenceSubject; path: string | null };

/**
 * Owns the ONE "Evidence & Context" drawer of the authed app. It is mounted in the `(app)` layout,
 * so a page header action, a card and a table row all open the same drawer through
 * `useEvidenceDrawer()`.
 *
 * The layout does not unmount on a client navigation, so the drawer is open only for the path it
 * was opened on: a navigation drops the subject.
 */
export function EvidenceDrawerProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [state, setState] = useState<OpenState | null>(null);

    // Drop the subject of another path during render (no effect, no extra paint). React renders
    // again before it commits, so the drawer is never shown on another path, and it does not
    // open again when the user comes back to the path.
    if (state !== null && state.path !== pathname) {
        setState(null);
    }

    const open = useCallback(
        (subject: EvidenceSubject) => setState({ subject, path: pathname }),
        [pathname],
    );
    const close = useCallback(() => setState(null), []);
    const api = useMemo(() => ({ open, close }), [open, close]);

    const subject = state?.subject ?? null;

    return (
        <EvidenceDrawerContext.Provider value={api}>
            {children}
            {subject ? (
                <EvidencePanel
                    // A new subject starts with no data of the subject before it.
                    key={`${subject.title}|${subject.apiUrl ?? ""}|${subject.metric ?? ""}`}
                    isOpen
                    onCloseAction={close}
                    title={subject.title}
                    apiUrl={subject.apiUrl}
                    metric={subject.metric}
                    filters={subject.filters}
                />
            ) : null}
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
