import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OAuthConsentForm } from "@/components/acr/OAuthConsentForm";
import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import { openOAuthConsent } from "@/lib/acr/service";
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
    // JSX is never constructed inside the try below (react-hooks/error-boundaries) —
    // the consent step result and any mapped error state are resolved first, and
    // the return/JSX happens after the catch. The impersonation refusal is in the
    // service, by the impersonation state (CHAOS-12095): "denied".
    let opening: Awaited<ReturnType<typeof openOAuthConsent>> | undefined;
    let errorState: "completed" | "denied" | "expired" | "invalid" | "unavailable" | undefined;
    try {
        opening = await openOAuthConsent({ handle, signal: new AbortController().signal });
    } catch (error) {
        if (error instanceof AcrRuntimeError && error.code === acrRuntimeErrorCodes.expired) {
            errorState = "expired";
        } else if (
            error instanceof AcrRuntimeError &&
            error.code === acrRuntimeErrorCodes.alreadyCompleted
        ) {
            errorState = "completed";
        } else if (
            error instanceof AcrRuntimeError &&
            error.code === acrRuntimeErrorCodes.invalidRequest
        ) {
            errorState = "invalid";
        } else if (
            error instanceof AcrRuntimeError &&
            error.code === acrRuntimeErrorCodes.notEntitled
        ) {
            errorState = "denied";
        } else {
            errorState = "unavailable";
        }
    }

    // The first-party browser client: approved by the server, no click (chris decision 2).
    if (opening?.kind === "approved") redirect(opening.redirectUrl);
    if (opening?.kind === "review") {
        return <OAuthConsentForm handle={handle} preview={opening.preview} />;
    }
    return <OAuthConsentForm initialState={errorState ?? "unavailable"} />;
}
