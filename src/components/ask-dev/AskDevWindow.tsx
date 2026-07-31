"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import fcLogo from "@/assets/fc-logo.png";
import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevConversation } from "./AskDevConversation";
import { useAskDev } from "./AskDevProvider";

/** Matches the Tailwind `max-sm:` breakpoint used below the window's mobile full-screen classes. */
const MOBILE_FULL_SCREEN_QUERY = "(max-width: 639.98px)";

/** Focusable candidates considered for the mobile Tab/Shift+Tab trap (ConfirmDialog pattern). */
const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function matchesMobileFullScreen(): boolean {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia(MOBILE_FULL_SCREEN_QUERY).matches;
}

/** Tracks whether the viewport currently renders the window full-screen (CHAOS-3215 M5). */
function useIsMobileFullScreen(): boolean {
    const [isMobile, setIsMobile] = useState(() => matchesMobileFullScreen());

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const query = window.matchMedia(MOBILE_FULL_SCREEN_QUERY);
        const update = () => setIsMobile(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);

    return isMobile;
}

export function AskDevWindow() {
    const { closePanel, panelMode, openPanel, setPanelMode } = useAskDev();
    const launcherRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLElement>(null);
    const isMobileFullScreen = useIsMobileFullScreen();

    useEffect(() => {
        if (panelMode !== "closed") panelRef.current?.focus();
    }, [panelMode]);

    // A desktop→mobile viewport transition can turn an already-open, non-modal
    // panel into a modal one while focus is still on a background control
    // (the desktop panel intentionally does not trap focus, so the user could
    // be anywhere in the app). Re-evaluate whenever `isMobileFullScreen`
    // changes — not just `panelMode` — and, mirroring the on-open focus
    // behavior above, move focus into the panel if it is currently outside it
    // (CHAOS-3215 M5).
    useEffect(() => {
        if (panelMode === "closed" || !isMobileFullScreen) return;
        const container = panelRef.current;
        if (!container) return;
        if (!container.contains(document.activeElement)) container.focus();
    }, [isMobileFullScreen, panelMode]);

    const closeAndRestoreFocus = () => {
        closePanel();
        requestAnimationFrame(() => launcherRef.current?.focus());
    };

    // Focus trap: only while the window renders full-screen on mobile does it
    // behave as a true modal dialog — the docked desktop panel is
    // intentionally non-modal (the app behind it stays reachable). Tab from
    // the last focusable element wraps to the first, and Shift+Tab from the
    // first wraps to the last, so focus can never escape to obscured
    // background controls (CHAOS-3215 M5).
    const handlePanelKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeAndRestoreFocus();
            return;
        }
        if (!isMobileFullScreen || event.key !== "Tab") return;
        const container = panelRef.current;
        if (!container) return;
        const focusable = getFocusableElements(container);
        if (focusable.length === 0) {
            event.preventDefault();
            container.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey) {
            if (active === first || active === container) {
                event.preventDefault();
                last.focus();
            }
        } else if (active === last || active === container) {
            event.preventDefault();
            first.focus();
        }
    };

    if (panelMode === "closed") {
        return (
            <button
                ref={launcherRef}
                type="button"
                onClick={openPanel}
                className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-1.5 rounded-(--radius-pill) border border-(--accent-ai)/35 bg-(--surface-raised) px-3 py-2 text-sm font-medium text-(--text-primary) shadow-(--elevation-subtle) transition hover:-translate-y-0.5 hover:border-(--accent-ai)/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                aria-label={CTA_LABELS.openAskDev}
            >
                <Image
                    src={fcLogo}
                    alt=""
                    aria-hidden="true"
                    width={20}
                    height={20}
                    sizes="20px"
                    className="h-5 w-auto"
                />
                <span>Ask Dev</span>
            </button>
        );
    }

    const expanded = panelMode === "expanded";
    return (
        <section
            ref={panelRef}
            tabIndex={-1}
            aria-label="Ask Dev"
            role={isMobileFullScreen ? "dialog" : undefined}
            aria-modal={isMobileFullScreen ? "true" : undefined}
            className={`fixed z-50 flex flex-col overflow-hidden border border-(--border) bg-(--surface-raised) shadow-(--elevation-drawer) outline-none max-sm:inset-0 max-sm:h-dvh ${
                expanded
                    ? "bottom-4 right-4 top-4 w-[min(46rem,calc(100vw-2rem))] rounded-(--radius-lg)"
                    : "bottom-4 right-4 h-[min(44rem,calc(100dvh-2rem))] w-[min(28rem,calc(100vw-2rem))] rounded-(--radius-lg)"
            }`}
            onKeyDown={handlePanelKeyDown}
        >
            <header className="flex items-center justify-between gap-3 border-b border-(--border) bg-(--surface)/80 px-4 py-3">
                <div className="min-w-0">
                    <p className="text-label-caps text-(--accent-ai)">
                        Evidence-backed investigation
                    </p>
                    <h2 className="truncate font-(--font-display) text-h3 text-(--text-primary)">
                        Ask Dev
                    </h2>
                </div>
                <div className="flex items-center gap-1">
                    <Link
                        href="/dev"
                        className="rounded-(--radius-sm) px-2 py-1.5 text-xs font-medium text-(--text-secondary) transition hover:bg-(--surface-raised) hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                    >
                        {CTA_LABELS.askDevWorkspace}
                    </Link>
                    <button
                        type="button"
                        onClick={() => setPanelMode(expanded ? "compact" : "expanded")}
                        aria-label={expanded ? CTA_LABELS.reduceAskDev : CTA_LABELS.expandAskDev}
                        className="rounded-(--radius-sm) px-2 py-1.5 text-(--text-secondary) hover:bg-(--surface-raised) hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                    >
                        <span aria-hidden="true">{expanded ? "↘" : "↖"}</span>
                    </button>
                    <button
                        type="button"
                        onClick={closeAndRestoreFocus}
                        aria-label={CTA_LABELS.closePanel}
                        className="rounded-(--radius-sm) px-2 py-1.5 text-(--text-secondary) hover:bg-(--surface-raised) hover:text-(--text-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/45"
                    >
                        <span aria-hidden="true">—</span>
                    </button>
                </div>
            </header>
            <AskDevConversation compact />
        </section>
    );
}
