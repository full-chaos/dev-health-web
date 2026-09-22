import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OAuthConsentForm } from "@/components/acr/OAuthConsentForm";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import { previewOAuthConsent } from "@/lib/acr/service";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The handle is carried in the URL — never let it leak to a Referer header on
// an outbound navigation from this page.
export const metadata: Metadata = {
    referrer: "no-referrer",
};

// Opaque handle minted by ACR: 43 base64url characters (un-padded 256-bit value).
const HANDLE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

type SearchParams = Promise<{ handle?: string }>;

export default async function OAuthAuthorizePage({
    searchParams,
}: {
    readonly searchParams: SearchParams;
}) {
    const params = await searchParams;
    const handle = params.handle;
    if (!handle || !HANDLE_PATTERN.test(handle)) {
        return <OAuthConsentForm initialState="invalid" />;
    }

    const session = await auth();
    if (!session?.access_token || !session.user.id || !session.user.org_id) {
        redirect(
            `/auth/signin?callbackUrl=${encodeURIComponent(`/acr/authorize?handle=${handle}`)}`,
        );
    }
    if (
        session.user.real_org_id !== undefined &&
        session.user.real_org_id !== session.user.org_id
    ) {
        return <OAuthConsentForm initialState="denied" />;
    }

    // JSX is never constructed inside the try below (react-hooks/error-boundaries) —
    // the preview call result and any mapped error state are resolved first, and
    // the return/JSX happens after the catch.
    let preview: Awaited<ReturnType<typeof previewOAuthConsent>> | undefined;
    let previewErrorState: "expired" | "completed" | "invalid" | "unavailable" | undefined;
    try {
        preview = await previewOAuthConsent({ handle, signal: new AbortController().signal });
    } catch (error) {
        if (error instanceof AcrRuntimeError && error.code === acrRuntimeErrorCodes.expired) {
            previewErrorState = "expired";
        } else if (
            error instanceof AcrRuntimeError &&
            error.code === acrRuntimeErrorCodes.alreadyCompleted
        ) {
            previewErrorState = "completed";
        } else if (
            error instanceof AcrRuntimeError &&
            error.code === acrRuntimeErrorCodes.invalidRequest
        ) {
            previewErrorState = "invalid";
        } else {
            previewErrorState = "unavailable";
        }
    }

    if (preview) {
        return <OAuthConsentForm handle={handle} preview={preview} />;
    }
    return <OAuthConsentForm initialState={previewErrorState ?? "unavailable"} />;
}
