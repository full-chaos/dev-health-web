"use client";

import { useEffect, useMemo } from "react";

import {
    isApprovedAskDevSurfaceContext,
    type AskDevSurfaceContext,
} from "@/lib/dev/contextualEntryPoints";

import { useOptionalAskDev } from "./AskDevProvider";

type AskDevContextRegistrationProps = {
    context: AskDevSurfaceContext;
};

function serializeApprovedContext(context: AskDevSurfaceContext): string | null {
    if (!isApprovedAskDevSurfaceContext(context)) return null;

    return JSON.stringify({
        routeId: context.routeId,
        entityRefs: context.entityRefs.map((ref) => ({
            entity_type: ref.entity_type,
            entity_id: ref.entity_id,
            display_label: ref.display_label,
            ...(ref.repository_id === undefined ? {} : { repository_id: ref.repository_id }),
        })),
        ...(context.filterFingerprint === undefined
            ? {}
            : { filterFingerprint: context.filterFingerprint }),
        ...(context.suggestedQuestionIds === undefined
            ? {}
            : { suggestedQuestionIds: context.suggestedQuestionIds }),
    });
}

/**
 * Registers approved page context with the app-wide Ask Dev window without
 * adding another visible Ask Dev control to the page.
 */
export function AskDevContextRegistration({ context }: AskDevContextRegistrationProps) {
    const askDev = useOptionalAskDev();
    const serializedContext = serializeApprovedContext(context);
    const approvedContext = useMemo(() => {
        if (!serializedContext) return null;
        const parsed: unknown = JSON.parse(serializedContext);
        return isApprovedAskDevSurfaceContext(parsed) ? parsed : null;
    }, [serializedContext]);

    const contextualEntrypointsEnabled = askDev?.contextualEntrypointsEnabled ?? false;
    const setProposedContext = askDev?.setProposedContext;

    useEffect(() => {
        if (!contextualEntrypointsEnabled || !approvedContext || !setProposedContext) {
            return;
        }

        setProposedContext(approvedContext);
    }, [approvedContext, contextualEntrypointsEnabled, setProposedContext]);

    return null;
}
