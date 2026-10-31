import { describe, expect, it } from "vitest";
import opsCodes from "./testdata/ops-reason-codes.json";
import {
    AUTH_UI_STATES,
    CODE_STATES,
    DECISION_REASON_CODES,
    reasonToState,
    type AuthUiState,
} from "../reasonStates";

const PINNED_DECISION_CODES = [
    "allowed_by_repository_grant",
    "grant_absent",
    "repository_not_granted",
    "platform_role_absent",
];

describe("reasonStates", () => {
    it("pins the closed decision reason code list", () => {
        expect([...DECISION_REASON_CODES].sort()).toEqual([...PINNED_DECISION_CODES].sort());
    });

    it.each([
        ["allowed_by_repository_grant", "allowed"],
        ["grant_absent", "denied"],
        ["repository_not_granted", "denied"],
        ["platform_role_absent", "denied"],
        ["credential_missing", "signin"],
        ["expired", "signin"],
        ["principal_deactivated", "signin"],
        ["rate_limited", "unavailable"],
        ["current_state_unavailable", "unavailable"],
        ["authority_unavailable", "unavailable"],
        ["upstream_unavailable", "unavailable"],
        ["internal_error", "unavailable"],
        ["not_found", "notfound"],
        ["denied_no_membership", "notfound"],
        ["denied_policy", "denied"],
        ["denied_no_grant", "denied"],
    ] as [string, AuthUiState][])("maps %s to %s", (code, state) => {
        expect(reasonToState(code).state).toBe(state);
    });

    it("renders a hidden-resource deny as not found", () => {
        for (const code of [
            "grant_absent",
            "repository_not_granted",
            "denied_policy",
            "denied_no_grant",
        ]) {
            expect(reasonToState(code, { hidden: true }).state).toBe("notfound");
        }
    });

    it("keeps sign-in and unavailable states when the resource is hidden", () => {
        expect(reasonToState("credential_missing", { hidden: true }).state).toBe("signin");
        expect(reasonToState("rate_limited", { hidden: true }).state).toBe("unavailable");
    });

    it("never turns a hidden-resource allow into a deny", () => {
        expect(reasonToState("allowed_by_repository_grant", { hidden: true }).state).toBe(
            "allowed",
        );
    });

    it("reaches the entitlement state only through the explicit flag", () => {
        expect(reasonToState("platform_role_absent", { entitlement: true }).state).toBe(
            "entitlement",
        );
        expect(reasonToState("platform_role_absent").state).toBe("denied");
        expect(reasonToState("allowed_by_repository_grant", { entitlement: true }).state).toBe(
            "allowed",
        );
    });

    it("lets a hidden resource win over the entitlement flag", () => {
        expect(reasonToState("grant_absent", { hidden: true, entitlement: true }).state).toBe(
            "notfound",
        );
    });

    it("fails closed to unavailable for an unknown code", () => {
        expect(reasonToState("brand_new_code").state).toBe("unavailable");
        expect(reasonToState("").state).toBe("unavailable");
    });

    it.each([
        undefined,
        null,
        7,
        {},
        [],
        true,
        "__proto__",
        "constructor",
        "toString",
        "hasOwnProperty",
    ])("fails closed to unavailable for input %j", (input) => {
        expect(reasonToState(input).state).toBe("unavailable");
    });

    it("never echoes any mapped code or the unknown probe in the message", () => {
        const mapped = [
            "allowed_by_repository_grant",
            "grant_absent",
            "repository_not_granted",
            "platform_role_absent",
            "denied_policy",
            "denied_no_grant",
            "denied_no_membership",
            "not_found",
            "credential_missing",
            "expired",
            "principal_deactivated",
            "rate_limited",
            "current_state_unavailable",
            "authority_unavailable",
            "upstream_unavailable",
            "internal_error",
        ];
        for (const code of [...mapped, "secret_probe_code"]) {
            for (const ctx of [{}, { hidden: true }, { entitlement: true }]) {
                const r = reasonToState(code, ctx);
                expect(JSON.stringify(r)).not.toContain(code);
            }
        }
    });

    it("gives every state a fixed non-empty message", () => {
        for (const state of AUTH_UI_STATES) {
            const hit = [
                "allowed_by_repository_grant",
                "grant_absent",
                "credential_missing",
                "rate_limited",
                "not_found",
            ]
                .map((c) => reasonToState(c))
                .find((r) => r.state === state);
            const r = hit ?? reasonToState("platform_role_absent", { entitlement: true });
            expect(r.message.length).toBeGreaterThan(0);
        }
    });
});

describe("reasonStates CHAOS-10875 codes", () => {
    it.each([
        ...[
            "session_expired",
            "session_revoked",
            "refresh_expired",
            "refresh_unknown",
            "refresh_reused",
            "invalid_credentials",
            "malformed",
            "bad_signature",
            "audience",
            "issuer",
            "not_yet_valid",
            "missing_sub",
            "missing_type",
            "type_mismatch",
            "revision_stale",
            "principal_not_found",
            "account_locked",
            "email_unverified",
            "replayed",
            "nonce_mismatch",
        ].map((c) => [c, "signin"]),
        ["not_entitled", "entitlement"],
        ["membership_required", "denied"],
        ["provisioning_disabled", "denied"],
        ["domain_not_allowed", "denied"],
        ["provider_already_linked", "signin"],
        ["identity_conflict", "signin"],
        ["email_collision", "signin"],
        ["store_unavailable", "unavailable"],
        ["dependency_unavailable", "unavailable"],
        ["signup_unavailable", "unavailable"],
    ] as [string, AuthUiState][])("maps %s to %s", (code, state) => {
        expect(reasonToState(code).state).toBe(state);
    });

    it("renders hidden membership_required as not found", () => {
        expect(reasonToState("membership_required", { hidden: true }).state).toBe("notfound");
    });

    it("gives every account-existence code one identical state and message", () => {
        const codes = [
            "invalid_credentials",
            "principal_not_found",
            "account_locked",
            "email_unverified",
            "principal_deactivated",
            "email_collision",
            "identity_conflict",
            "provider_already_linked",
        ];
        const first = reasonToState(codes[0]);
        expect(first.state).toBe("signin");
        for (const code of codes) {
            for (const ctx of [{}, { hidden: true }, { entitlement: true }]) {
                expect(reasonToState(code, ctx)).toEqual(first);
            }
        }
    });

    it.each([...opsCodes.decision_reason_code, ...opsCodes.auth_outcome_reason_codes])(
        "pinned ops code %s is mapped",
        (code) => {
            expect(Object.hasOwn(CODE_STATES, code)).toBe(true);
        },
    );
});
