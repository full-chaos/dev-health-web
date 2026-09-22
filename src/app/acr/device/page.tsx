import { redirect } from "next/navigation";

import { DeviceApprovalForm } from "@/components/acr/DeviceApprovalForm";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// acr's device_approval_preview_request.v1 schema: 8 chars, the
// confusable-glyph-free alphabet (no 0/1/I/O). A query-string value that
// doesn't match this exactly is never forwarded as a prefill -- the typed
// entry fallback (an empty, user-editable input) covers every other case,
// so there is no state where a malformed or malicious `user_code` value
// reaches the rendered page.
const USER_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/u;

// Next.js gives a repeated query key (`?user_code=A&user_code=B`) as a
// string array, never a scalar -- the type below is honest about that so a
// caller can't assume `.trim()` is safe without checking first.
type SearchParams = Promise<{ user_code?: string | string[] }>;

export default async function DeviceApprovalPage({
    searchParams,
}: {
    readonly searchParams: SearchParams;
}) {
    const params = await searchParams;
    // A repeated user_code is never a value ACR itself would print (its own
    // verification_uri_complete carries exactly one) -- treat the array
    // shape as malformed input and fall through to the typed-entry state,
    // the same as any other value that fails the pattern below.
    const rawUserCode = typeof params.user_code === "string" ? params.user_code : undefined;
    const candidate = rawUserCode?.trim().toUpperCase();
    const initialUserCode = candidate && USER_CODE_PATTERN.test(candidate) ? candidate : undefined;

    const session = await auth();
    if (!session?.access_token || !session.user.id || !session.user.org_id) {
        const callbackUrl = initialUserCode
            ? `/acr/device?user_code=${initialUserCode}`
            : "/acr/device";
        redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
    if (
        session.user.real_org_id !== undefined &&
        session.user.real_org_id !== session.user.org_id
    ) {
        return <DeviceApprovalForm initialState="denied" />;
    }
    return <DeviceApprovalForm initialUserCode={initialUserCode} />;
}
