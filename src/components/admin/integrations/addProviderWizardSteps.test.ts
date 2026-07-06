import { describe, expect, it } from "vitest";

import {
    getAddProviderStepBlockReason,
    getVisibleAddProviderSteps,
    isRedirectMethod,
    providerHasAuthMethodChoice,
    type AddProviderStepGateContext,
} from "./addProviderWizardSteps";

function ctx(overrides: Partial<AddProviderStepGateContext> = {}): AddProviderStepGateContext {
    return {
        provider: "github",
        method: null,
        credentialName: "",
        credentialFieldsComplete: false,
        verified: false,
        ...overrides,
    };
}

describe("providerHasAuthMethodChoice", () => {
    it("is true for github when no GitHub App is connected yet", () => {
        expect(providerHasAuthMethodChoice("github", false)).toBe(true);
    });

    it("is false for github once a GitHub App is already connected", () => {
        expect(providerHasAuthMethodChoice("github", true)).toBe(false);
    });

    it("is false for every non-github provider", () => {
        expect(providerHasAuthMethodChoice("gitlab", false)).toBe(false);
        expect(providerHasAuthMethodChoice("jira", false)).toBe(false);
        expect(providerHasAuthMethodChoice("linear", false)).toBe(false);
        expect(providerHasAuthMethodChoice("launchdarkly", false)).toBe(false);
    });
});

describe("getVisibleAddProviderSteps", () => {
    it("includes the method step for github when no GitHub App is connected", () => {
        const steps = getVisibleAddProviderSteps("github", false, false);
        expect(steps.map((s) => s.id)).toEqual([
            "provider",
            "method",
            "credential",
            "verify",
            "review",
        ]);
    });

    it("hides the method step for github once a GitHub App is already connected", () => {
        const steps = getVisibleAddProviderSteps("github", true, false);
        expect(steps.map((s) => s.id)).toEqual(["provider", "credential", "verify", "review"]);
    });

    it("hides the method step for non-github providers", () => {
        const steps = getVisibleAddProviderSteps("linear", false, false);
        expect(steps.map((s) => s.id)).toEqual(["provider", "credential", "verify", "review"]);
    });

    it("hides the provider step when launched from a fixed provider page", () => {
        const steps = getVisibleAddProviderSteps("github", false, true);
        expect(steps.map((s) => s.id)).toEqual(["method", "credential", "verify", "review"]);
    });
});

describe("isRedirectMethod", () => {
    it("is true only for github_app", () => {
        expect(isRedirectMethod("github_app")).toBe(true);
        expect(isRedirectMethod("manual")).toBe(false);
        expect(isRedirectMethod(null)).toBe(false);
    });
});

describe("getAddProviderStepBlockReason", () => {
    it("blocks the provider step until a provider is chosen", () => {
        expect(getAddProviderStepBlockReason("provider", ctx({ provider: "" }))).toMatch(
            /choose a provider/i,
        );
        expect(getAddProviderStepBlockReason("provider", ctx())).toBeNull();
    });

    it("blocks the method step until a method is chosen", () => {
        expect(getAddProviderStepBlockReason("method", ctx({ method: null }))).toMatch(
            /choose how you want to authenticate/i,
        );
        expect(getAddProviderStepBlockReason("method", ctx({ method: "manual" }))).toBeNull();
    });

    it('blocks the credential step until the required field is complete, regardless of name (optional, defaults to "default")', () => {
        expect(
            getAddProviderStepBlockReason(
                "credential",
                ctx({ method: "manual", credentialName: "", credentialFieldsComplete: false }),
            ),
        ).toMatch(/fill in the required fields/i);

        expect(
            getAddProviderStepBlockReason(
                "credential",
                ctx({ method: "manual", credentialName: "", credentialFieldsComplete: true }),
            ),
        ).toBeNull();

        expect(
            getAddProviderStepBlockReason(
                "credential",
                ctx({ method: "manual", credentialName: "prod", credentialFieldsComplete: true }),
            ),
        ).toBeNull();
    });

    it("never blocks the credential step for github_app (redirect handles it)", () => {
        expect(
            getAddProviderStepBlockReason("credential", ctx({ method: "github_app" })),
        ).toBeNull();
    });

    it("blocks the verify step until the connection tests successfully for manual method", () => {
        expect(
            getAddProviderStepBlockReason("verify", ctx({ method: "manual", verified: false })),
        ).toMatch(/test the connection/i);

        expect(
            getAddProviderStepBlockReason("verify", ctx({ method: "manual", verified: true })),
        ).toBeNull();
    });

    it("never blocks the verify step for github_app (redirect handles it)", () => {
        expect(
            getAddProviderStepBlockReason("verify", ctx({ method: "github_app", verified: false })),
        ).toBeNull();
    });

    it("never blocks the review step", () => {
        expect(getAddProviderStepBlockReason("review", ctx())).toBeNull();
    });
});
