import type { Metadata } from "next";

import { AcrOAuthCallback } from "@/components/ask-dev/oauth/AcrOAuthCallback";

/**
 * The exact redirect URI of web's ACR browser client: `/ask-dev/oauth/callback` (CHAOS-12303).
 * The page reads nothing on the server. Its URL carries the authorization code and state, so no
 * Referer leaves it (with the proxy's header), and the client scrubs the URL first.
 */
/**
 * Rendered per request (CHAOS-12337): see the start page. That also gives it Next's no-store
 * caching for a dynamic page, which its URL (a code and a state) needs.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Ask Dev sign-in",
    referrer: "no-referrer",
    robots: { index: false, follow: false },
};

export default function AcrOAuthCallbackPage() {
    return <AcrOAuthCallback />;
}
