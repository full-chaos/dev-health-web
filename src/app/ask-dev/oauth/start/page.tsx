import type { Metadata } from "next";
import { Suspense } from "react";

import { AcrOAuthStart } from "@/components/ask-dev/oauth/AcrOAuthStart";

/** The entry of the ACR browser authorization (CHAOS-12303). It reads nothing on the server. */
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
