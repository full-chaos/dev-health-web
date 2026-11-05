import { ACTION_FAILED_MESSAGE, UserFacingActionError } from "@/lib/actionFailure";
import { AdminApiError } from "./api/_request";

/** The sentences shown for a refused organization or membership change. App-authored; no served text. */
export const ORG_MEMBER_REFUSAL = {
    roleInvalid: "Pick viewer, member, admin or owner.",
    inviteInvalid: "The invite is not valid. Check the email address.",
    lastOwner: "This is the last owner. Name another owner first.",
    notOwner: "Only an owner can hand over ownership.",
    targetNotMember: "The new owner must be a member of this organization.",
    forbidden: "You cannot change this member.",
    notFound: "Not found.",
    alreadyMember: "This person is already a member.",
    membershipSuspended: "This membership is suspended.",
    organizationSuspended: "This organization is suspended.",
    invitePending: "An invite for this email is already pending.",
    inviteNotPending: "This invite is no longer pending.",
    stateChanged: "The list changed. Reload it and try again.",
    usersNotOwned: "People are managed in the identity service. Invite the person instead.",
    unavailable: "Unavailable, nothing was changed. Try again.",
    generic: ACTION_FAILED_MESSAGE,
} as const;

const T = ORG_MEMBER_REFUSAL;

const BY_CODE: Record<string, string> = {
    role_invalid: T.roleInvalid,
    invite_invalid: T.inviteInvalid,
    email_invalid: T.inviteInvalid,
    ttl_invalid: T.inviteInvalid,
    last_owner: T.lastOwner,
    admin_required: T.forbidden,
    superuser_required: T.forbidden,
    principal_deactivated: T.forbidden,
    membership_not_found: T.notFound,
    organization_not_found: T.notFound,
    principal_not_found: T.notFound,
    not_owner: T.notOwner,
    target_not_member: T.targetNotMember,
    already_member: T.alreadyMember,
    membership_suspended: T.membershipSuspended,
    organization_suspended: T.organizationSuspended,
    invite_pending: T.invitePending,
    invite_not_pending: T.inviteNotPending,
    state_changed: T.stateChanged,
    users_not_owned: T.usersNotOwned,
};

// go-api answers a refusal with the text it gave before auth-service fronted these routes (PARITY-10988).
const BY_LEGACY_TEXT: Array<[string, string]> = [
    ["Cannot remove the last owner", T.lastOwner],
    ["User is already a member", T.alreadyMember],
    ["Source user is not an owner", T.notOwner],
    ["Target user is not a member", T.targetNotMember],
    ["Invalid role:", T.roleInvalid],
    ["value is not a valid email address", T.inviteInvalid],
    ["A pending invite already exists", T.invitePending],
];

/**
 * The sentence for a refused change, or undefined when this vocabulary has none (the generic path
 * applies). A served code wins over the status; an unknown code is the generic sentence, and no
 * served text is ever returned.
 */
export function orgMemberRefusalText(refusal: {
    status: number;
    code?: string;
    detail?: string;
}): string | undefined {
    const { status, code, detail } = refusal;
    if (status === 401) return undefined;
    if (code !== undefined) return BY_CODE[code] ?? T.generic;
    if (status === 503) return T.unavailable;
    if (status === 403) return T.forbidden;
    if (status === 404) return T.notFound;
    if (status === 400 || status === 409) {
        const hit = BY_LEGACY_TEXT.find(([prefix]) => detail?.startsWith(prefix));
        return hit?.[1];
    }
    return undefined;
}

/**
 * Runs a change and turns a mapped refusal into an app-authored error; anything else passes through.
 * With `closed`, an unmapped 4xx other than 401 is the generic sentence, so served text never shows.
 */
export async function withOrgMemberRefusals<T>(
    fn: () => Promise<T>,
    options: { closed?: boolean } = {},
): Promise<T> {
    try {
        return await fn();
    } catch (err) {
        if (err instanceof AdminApiError) {
            const text = orgMemberRefusalText({
                status: err.status,
                code: err.code,
                detail: err.detail,
            });
            if (text !== undefined) throw new UserFacingActionError(err.status, text);
            if (options.closed && err.status >= 400 && err.status < 500 && err.status !== 401) {
                throw new UserFacingActionError(err.status, T.generic);
            }
        }
        throw err;
    }
}
