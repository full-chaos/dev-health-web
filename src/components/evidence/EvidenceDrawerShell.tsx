"use client";

import type { ReactNode, RefObject } from "react";

import { Drawer } from "@/components/ui/Drawer";

/** The drawer title is the same for every subject; the subject is a heading in the body. */
export const EVIDENCE_DRAWER_TITLE = "Evidence & Context";
const EVIDENCE_DRAWER_EYEBROW = "Contextual investigation";

type EvidenceDrawerShellProps = {
    /** The signal, metric, dot, row or cell the evidence is about. */
    subject: string;
    onCloseAction: () => void;
    footer?: ReactNode;
    /** Gets focus on close. Default: the element that had focus when the drawer opened. */
    returnFocusRef?: RefObject<HTMLElement | null>;
    children: ReactNode;
};

/**
 * The frame of the one "Evidence & Context" drawer: fixed title and eyebrow, then the subject as
 * a heading, then the body. Every evidence body (an explain request, a quadrant dot, a heatmap
 * cell, a table row) renders inside this frame, so the drawer reads the same from every opener.
 *
 * Escape contract: `Drawer` closes on Escape unless an inner control already handled it and
 * called `preventDefault()`.
 */
export function EvidenceDrawerShell({
    subject,
    onCloseAction,
    footer,
    returnFocusRef,
    children,
}: EvidenceDrawerShellProps) {
    return (
        <Drawer
            open
            onCloseAction={onCloseAction}
            title={EVIDENCE_DRAWER_TITLE}
            eyebrow={EVIDENCE_DRAWER_EYEBROW}
            footer={footer}
            returnFocusRef={returnFocusRef}
        >
            <div className="space-y-4">
                {/* The subject. The drawer title is the same for all. */}
                <h3
                    data-testid="evidence-subject"
                    className="text-h3 font-semibold text-foreground"
                >
                    {subject}
                </h3>
                {children}
            </div>
        </Drawer>
    );
}
