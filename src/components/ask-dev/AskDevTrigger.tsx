"use client";

import { CTA_LABELS } from "@/lib/design/cta";
import {
    isApprovedAskDevSurfaceContext,
    type AskDevSurfaceContext,
} from "@/lib/dev/contextualEntryPoints";
import { trackTelemetryEvent } from "@/lib/telemetry";

import { useOptionalAskDev } from "./AskDevProvider";

type AskDevTriggerProps = {
    context: AskDevSurfaceContext;
    className?: string;
};

/**
 * Opens the single app-wide Ask Dev window with an approved in-memory context.
 * It never accepts a prompt and never creates or submits a request.
 */
export function AskDevTrigger({ context, className = "" }: AskDevTriggerProps) {
    const askDev = useOptionalAskDev();
    if (!askDev?.contextualEntrypointsEnabled || !isApprovedAskDevSurfaceContext(context)) {
        return null;
    }

    const openWithContext = () => {
        askDev.setProposedContext(context);
        askDev.openPanel();
        trackTelemetryEvent("feature_viewed", {
            feature: "ask_dev_contextual_entrypoint",
            surface: context.routeId,
            routePattern: context.routeId,
        });
    };

    return (
        <button
            type="button"
            onClick={openWithContext}
            className={`inline-flex min-h-10 items-center gap-2 rounded-(--radius-pill) border border-(--accent-ai)/35 bg-(--surface-raised) px-4 py-2 text-sm font-medium text-(--text-primary) shadow-(--elevation-subtle) transition hover:border-(--accent-ai)/70 hover:text-(--accent-ai) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ai)/50 ${className}`}
        >
            <span aria-hidden="true" className="text-(--accent-ai)">
                ✦
            </span>
            <span>{CTA_LABELS.askDevAboutThis}</span>
        </button>
    );
}
