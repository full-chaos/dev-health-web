import { describe, expect, it } from "vitest";

import { appendCallbackUrl, safePostLoginRedirect } from "@/lib/post-login-redirect";

describe("post-login redirect helpers", () => {
    it("allows local post-login redirects", () => {
        expect(safePostLoginRedirect("/dashboard")).toBe("/dashboard");
        expect(safePostLoginRedirect("/org/123?tab=settings")).toBe("/org/123?tab=settings");
    });

    it("rejects open redirects and auth-page bounce backs", () => {
        expect(safePostLoginRedirect("https://evil.example/steal")).toBeUndefined();
        expect(safePostLoginRedirect("//evil.example/steal")).toBeUndefined();
        expect(safePostLoginRedirect("/auth/signin")).toBeUndefined();
        expect(safePostLoginRedirect("/auth/onboard?plan=team")).toBeUndefined();
        expect(safePostLoginRedirect("/login?next=/dashboard")).toBeUndefined();
    });

    it("preserves callbackUrl when threading auth tabs", () => {
        expect(appendCallbackUrl("/auth/signup", "/dashboard")).toBe(
            "/auth/signup?callbackUrl=%2Fdashboard",
        );
        expect(appendCallbackUrl("/auth/signin?plan=team&trial=true", "/dashboard")).toBe(
            "/auth/signin?plan=team&trial=true&callbackUrl=%2Fdashboard",
        );
    });
});
