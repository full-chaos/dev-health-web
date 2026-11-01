"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";

import fcLogo from "@/assets/fc-logo.svg";
import { CTA_LABELS } from "@/lib/design/cta";
import { isAskDevPanelPath } from "@/lib/ask-dev/surface";

import { ASK_DEV_PANEL_ID } from "./askDevPanelId";
import { useAskDevShell } from "./AskDevShellContext";
import { useAskDevAvailability } from "./useAskDevAvailability";

type AskDevLauncherProps = {
    /** Which bar draws it. Each bar is shown at one breakpoint, so one launcher is visible. */
    placement: "top-bar" | "mobile-bar";
};

const noSubscription = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/**
 * The one Ask Dev launcher of a bar: the Full Chaos logo, named "Open Ask Dev" (CHAOS-3247: no
 * sparkle or other AI glyph). It draws nothing when the organization has no Ask Dev entitlement,
 * while impersonating with the browser ACR client on (CHAOS-12306), or on an excluded route. A
 * click only flips the shared open flag; it sends no request.
 *
 * It is disabled until the page hydrates (CHAOS-12422): the server's button has no handler yet, so
 * a click on a slow machine would be lost with no sign. The hydration render matches the server's.
 */
export function AskDevLauncher({ placement }: AskDevLauncherProps) {
    const pathname = usePathname() ?? "";
    const availability = useAskDevAvailability();
    const { open, setOpen } = useAskDevShell();
    const hydrated = useSyncExternalStore(noSubscription, onClient, onServer);
    if (availability !== "on" || !isAskDevPanelPath(pathname)) return null;
    return (
        <button
            type="button"
            disabled={!hydrated}
            data-testid={`ask-dev-launcher-${placement}`}
            data-ask-dev-launcher=""
            aria-label={CTA_LABELS.openAskDev}
            aria-expanded={open}
            aria-controls={open ? ASK_DEV_PANEL_ID : undefined}
            title={CTA_LABELS.openAskDev}
            onClick={() => setOpen(!open)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-(--card-stroke) bg-(--card-80) text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
        >
            <Image
                src={fcLogo}
                alt=""
                aria-hidden="true"
                width={22}
                height={21}
                className="h-5 w-auto"
            />
        </button>
    );
}
