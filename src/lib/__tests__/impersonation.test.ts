import { describe, expect, it } from "vitest";
import { resolveActiveOrgId } from "../impersonation";

describe("resolveActiveOrgId", () => {
    it("returns the impersonation target org while impersonating, even when the admin has their own org", () => {
        // CHAOS-2303 regression: superuser who is ALSO an org member must not
        // forward their own org as the data scope during impersonation.
        expect(
            resolveActiveOrgId({
                org_id: "admins-own-org",
                is_impersonating: true,
                impersonated_org_id: "target-org",
            }),
        ).toBe("target-org");
    });

    it("returns the impersonation target org for org-less superusers", () => {
        expect(
            resolveActiveOrgId({
                org_id: undefined,
                is_impersonating: true,
                impersonated_org_id: "target-org",
            }),
        ).toBe("target-org");
    });

    it("returns the user's own org when not impersonating", () => {
        expect(
            resolveActiveOrgId({
                org_id: "my-org",
                is_impersonating: false,
                impersonated_org_id: undefined,
            }),
        ).toBe("my-org");
    });

    it("falls back to the user's own org when impersonation state has no target org yet", () => {
        expect(
            resolveActiveOrgId({
                org_id: "my-org",
                is_impersonating: true,
                impersonated_org_id: undefined,
            }),
        ).toBe("my-org");
    });

    it("returns undefined for org-less users who are not impersonating", () => {
        expect(resolveActiveOrgId({ org_id: undefined })).toBeUndefined();
    });

    it("returns undefined for missing users", () => {
        expect(resolveActiveOrgId(undefined)).toBeUndefined();
        expect(resolveActiveOrgId(null)).toBeUndefined();
    });
});
