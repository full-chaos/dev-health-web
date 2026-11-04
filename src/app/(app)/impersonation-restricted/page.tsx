import { notFound } from "next/navigation";

import { Notice } from "@/components/ui/Notice";
import { getServerEnv } from "@/lib/config";
import { CTA_LABELS } from "@/lib/design/cta";
import { PLATFORM_UI_SWITCH, platformUiMode } from "@/lib/auth/platform/mode";

// The page a limited session sees instead of a platform admin page (AUTHZ_PLATFORM_UI=enforce
// only). Off and shadow: no such page, as before.
export default function ImpersonationRestrictedPage() {
    if (platformUiMode(getServerEnv()[PLATFORM_UI_SWITCH.name]) !== "enforce") notFound();
    return (
        <div
            className="flex w-full max-w-3xl flex-col gap-6"
            data-testid="impersonation-restricted"
        >
            <Notice
                variant="warn"
                live={false}
                titleAs="h2"
                title="Platform admin is not available while you impersonate a user"
            >
                Platform pages and organization changes are closed while you act as another user, or
                while your impersonation status cannot be read. Select{" "}
                {CTA_LABELS.stopImpersonating} in the banner at the top of the page to return to
                your own account. If you are not impersonating, try again in a moment.
            </Notice>
        </div>
    );
}
