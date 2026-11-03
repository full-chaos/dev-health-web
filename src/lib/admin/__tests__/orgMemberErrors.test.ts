import { describe, expect, it } from "vitest";
import { ORG_MEMBER_REFUSAL, orgMemberRefusalText } from "../orgMemberErrors";

const T = ORG_MEMBER_REFUSAL;

describe("orgMemberRefusalText by code", () => {
    it.each([
        [400, "role_invalid", T.roleInvalid],
        [400, "invite_invalid", T.inviteInvalid],
        [400, "email_invalid", T.inviteInvalid],
        [400, "ttl_invalid", T.inviteInvalid],
        [400, "last_owner", T.lastOwner],
        [409, "last_owner", T.lastOwner],
        [403, "admin_required", T.forbidden],
        [403, "superuser_required", T.forbidden],
        [403, "principal_deactivated", T.forbidden],
        [404, "membership_not_found", T.notFound],
        [404, "organization_not_found", T.notFound],
        [409, "not_owner", T.notOwner],
        [409, "target_not_member", T.targetNotMember],
        [409, "already_member", T.alreadyMember],
        [409, "membership_suspended", T.membershipSuspended],
        [409, "organization_suspended", T.organizationSuspended],
        [409, "invite_pending", T.invitePending],
        [409, "invite_not_pending", T.inviteNotPending],
        [409, "state_changed", T.stateChanged],
        [409, "users_not_owned", T.usersNotOwned],
    ])("%i %s", (status, code, text) => {
        expect(orgMemberRefusalText({ status, code, detail: "served text" })).toBe(text);
    });

    it("maps by code before status", () => {
        expect(orgMemberRefusalText({ status: 400, code: "already_member" })).toBe(T.alreadyMember);
        expect(orgMemberRefusalText({ status: 409, code: "role_invalid" })).toBe(T.roleInvalid);
    });

    it("answers an unknown code with the generic text and never echoes the detail", () => {
        const text = orgMemberRefusalText({
            status: 409,
            code: "zz_new_code",
            detail: "secret-detail-77",
        });
        expect(text).toBe(T.generic);
        expect(text).not.toContain("secret-detail-77");
    });
});

describe("orgMemberRefusalText by status and legacy go-api text", () => {
    it.each([
        [400, "Cannot remove the last owner of an organization", T.lastOwner],
        [400, "User is already a member of this organization", T.alreadyMember],
        [400, "Source user is not an owner", T.notOwner],
        [400, "Target user is not a member", T.targetNotMember],
        [400, "Invalid role: root", T.roleInvalid],
        [400, "value is not a valid email address: no at sign", T.inviteInvalid],
        [409, "A pending invite already exists for this email", T.invitePending],
        [404, "Membership not found", T.notFound],
        [404, "Organization not found", T.notFound],
        [403, "Superuser access required", T.forbidden],
        [403, "Admin access required for organization", T.forbidden],
    ])("%i %s", (status, detail, text) => {
        expect(orgMemberRefusalText({ status, detail })).toBe(text);
    });

    it("maps a 403 and a 404 with any detail without echoing it", () => {
        expect(orgMemberRefusalText({ status: 403, detail: "who-is-x" })).toBe(T.forbidden);
        expect(orgMemberRefusalText({ status: 404, detail: "who-is-x" })).toBe(T.notFound);
    });

    it("maps every 503 to the unavailable text, with or without a detail", () => {
        expect(orgMemberRefusalText({ status: 503 })).toBe(T.unavailable);
        expect(
            orgMemberRefusalText({ status: 503, detail: "Authentication service unavailable" }),
        ).toBe(T.unavailable);
        expect(T.unavailable).toContain("nothing was changed");
    });

    it("leaves a codeless unmatched answer and other statuses to the generic path", () => {
        expect(orgMemberRefusalText({ status: 422, detail: "email: bad" })).toBeUndefined();
        expect(orgMemberRefusalText({ status: 400, detail: "Something else" })).toBeUndefined();
        expect(orgMemberRefusalText({ status: 401, detail: "No access token" })).toBeUndefined();
        expect(orgMemberRefusalText({ status: 500 })).toBeUndefined();
    });
});
