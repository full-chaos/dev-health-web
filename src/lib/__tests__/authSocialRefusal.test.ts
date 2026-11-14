import { describe, expect, it } from "vitest";
import {
    classifySocialRefusal,
    refusedSocialSignInPath,
    sameOriginCallbackPath,
    SOCIAL_REFUSAL_CODES,
} from "@/lib/authSocialRefusal";

// CHAOS-13756: the code of a refused social-login answer. The seven reasons a sign-in can answer map to
// social_<reason>; anything else is social_login_failed.
const refusal = (reason: unknown, extra: Record<string, unknown> = {}) => ({
    detail: { message: "fixed backend text", reason, ...extra },
});

describe("C4 classifySocialRefusal", () => {
    it.each([
        [403, "email_unverified", "social_email_unverified"],
        [409, "identity_conflict", "social_identity_conflict"],
        [403, "signup_unavailable", "social_signup_unavailable"],
        [403, "principal_deactivated", "social_principal_deactivated"],
        [401, "invalid_credentials", "social_invalid_credentials"],
        [400, "malformed", "social_malformed"],
        [503, "dependency_unavailable", "social_dependency_unavailable"],
    ])("%i %s -> %s", (status, reason, code) => {
        expect(classifySocialRefusal(status, refusal(reason))).toBe(code);
    });

    it.each([
        ["expired (link/unlink only)", 403, refusal("expired")],
        ["principal_not_found (link/unlink only)", 404, refusal("principal_not_found")],
        ["last_sign_in_method (link/unlink only)", 409, refusal("last_sign_in_method")],
        ["no reason (ops before its roll)", 403, { detail: { message: "x" } }],
        ["an unknown reason", 403, refusal("zz_new_reason")],
        ["an empty reason", 403, refusal("")],
        ["a prefixed reason", 403, refusal("social_email_unverified")],
        ["a reason that is not text", 403, refusal(["email_unverified"])],
        ["a text detail", 403, { detail: "email_already_registered" }],
        ["a 500 with no detail object", 500, { detail: "Internal Server Error" }],
        [
            "503 authentication unavailable",
            503,
            { detail: { message: "Authentication is unavailable" } },
        ],
        ["409 operation_moved (its own reason key)", 409, refusal("operation_moved")],
        ["409 Organization conflict", 409, { detail: { message: "Organization conflict" } }],
        ["no body", 502, null],
        ["a list body", 400, [refusal("malformed")]],
        ["a 2xx", 200, refusal("malformed")],
    ])("%s -> social_login_failed", (_name, status, body) => {
        expect(classifySocialRefusal(status, body)).toBe("social_login_failed");
    });

    it("every code is social_ prefixed: none collides with an Auth.js or session error code", () => {
        for (const code of SOCIAL_REFUSAL_CODES) expect(code.startsWith("social_")).toBe(true);
        expect(SOCIAL_REFUSAL_CODES).toHaveLength(8);
    });
});

describe("the sign-in page path of a refusal", () => {
    it("keeps an encoded query value of a local callbackUrl", () => {
        expect(
            sameOriginCallbackPath("http://localhost:3000/metrics?team=a%2Fb", "localhost:3000"),
        ).toBe("/metrics?team=a%2Fb");
    });

    it("keeps a local callbackUrl of the same host", () => {
        const path = sameOriginCallbackPath(
            "http://localhost:3000/metrics?team=a",
            "localhost:3000",
        );
        expect(path).toBe("/metrics?team=a");
        expect(refusedSocialSignInPath("social_malformed", path)).toBe(
            "/auth/signin?error=social_malformed&callbackUrl=%2Fmetrics%3Fteam%3Da",
        );
    });

    it.each([
        ["another origin", "https://evil.example/steal", "localhost:3000"],
        ["another port", "http://localhost:4000/dashboard", "localhost:3000"],
        ["a protocol-relative path", "//evil.example/steal", "localhost:3000"],
        ["an auth page", "http://localhost:3000/auth/signin", "localhost:3000"],
        ["no cookie", undefined, "localhost:3000"],
        ["no host", "http://localhost:3000/dashboard", undefined],
        ["not a URL", "::", "localhost:3000"],
        ["a backslash path", "http://localhost:3000/\\evil.example/steal", "localhost:3000"],
        ["a javascript: URL", "javascript:alert(document.cookie)", "localhost:3000"],
        [
            "an encoded double slash",
            "http://localhost:3000/%2F%2Fevil.example/steal",
            "localhost:3000",
        ],
        [
            "an encoded backslash",
            "http://localhost:3000/%5C%5Cevil.example/steal",
            "localhost:3000",
        ],
        [
            "an encoded control character",
            "http://localhost:3000/dashboard%0d%0aSet-Cookie:x=1",
            "localhost:3000",
        ],
        ["an encoded auth page", "http://localhost:3000/%61uth/signin", "localhost:3000"],
        ["a malformed encoding", "http://localhost:3000/dashboard%E0%A4%A", "localhost:3000"],
        ["a URL-encoded whole URL", "https%3A%2F%2Fevil.example%2Fsteal", "localhost:3000"],
    ])("drops the callbackUrl of %s: the page's safe default", (_name, raw, host) => {
        const path = sameOriginCallbackPath(raw, host);
        expect(path).toBeUndefined();
        expect(refusedSocialSignInPath("social_login_failed", path)).toBe(
            "/auth/signin?error=social_login_failed",
        );
    });
});
