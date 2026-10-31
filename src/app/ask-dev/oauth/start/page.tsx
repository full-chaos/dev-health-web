import type { Metadata } from "next";
import { Suspense } from "react";

import { AcrOAuthStart } from "@/components/ask-dev/oauth/AcrOAuthStart";

/** The entry of the ACR browser authorization (CHAOS-12303). It reads nothing on the server. */

/**
 * Rendered per request (CHAOS-12337). The proxy sends every page a per-request nonce CSP, and Next
 * puts that nonce on its inline scripts only when it renders the page per request. Prerendered,
 * this page's scripts were blocked and it never ran in a production build.
 * `scripts/check-nonce-csp-pages.mjs` holds every page to this after `next build`.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Ask Dev sign-in",
    robots: { index: false, follow: false },
};

export default function AcrOAuthStartPage() {
    return (
        <Suspense fallback={null}>
            <AcrOAuthStart />
        </Suspense>
    );
}
