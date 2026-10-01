import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-7735: error banners on the sign-in surface and in client components are
 * `Notice variant="danger"`. Banner text is the production text; a title exists only
 * where production had a heading. Sign-in surface banners render with the page
 * (`live={false}`, `centered`). Banners that already had `role="alert"` keep it
 * (Notice danger default); RepoSelector gains `role="alert"` (new, see RISK-NOTES).
 */
const src = (p: string) =>
    readFileSync(join(process.cwd(), "src", p), "utf8")
        .replace(/<Notice\s+variant/gu, "<Notice variant")
        .replace(/\s+/gu, " ");

const IMPORT = 'import { Notice } from "@/components/ui/Notice";';
const RED = /(?:bg|border)-(?:red-\d+|\(--negative\)\/(?:12|30))/u;

describe("sign-in surface banners", () => {
    for (const [file, text] of [
        ["app/(auth)/auth/signin/page.tsx", "<SocialLoginError error={socialError} />"],
        ["app/(auth)/auth/reset-password/page.tsx", "Missing reset token"],
        ["app/(auth)/auth/verify/page.tsx", "{message}"],
    ]) {
        it(`${file} is a centered, page-load Notice danger`, () => {
            const s = src(file);
            expect(s).toContain(IMPORT);
            expect(s).toMatch(/<Notice variant="danger" live=\{false\} centered/u);
            expect(s).toContain(text);
            expect(s).not.toMatch(/red-\d+/u);
        });
    }
    it("the sign-in social error keeps its width classes", () => {
        expect(src("app/(auth)/auth/signin/page.tsx")).toContain(
            'className="mb-4 w-full max-w-md"',
        );
    });
});

describe("client banners", () => {
    for (const [file, text, count] of [
        [
            "components/admin/integrations/GitHubAppConnect.tsx",
            "We couldn&apos;t connect the GitHub App.",
            1,
        ],
        ["components/admin/sync/RepoSelector.tsx", "Failed to load repositories: {error}", 1],
        [
            "components/admin/integrations/customer-push/CreateCustomerPushSourceForm.tsx",
            "{genericError}",
            2,
        ],
        [
            "components/admin/integrations/customer-push/CreateCustomerPushTokenForm.tsx",
            "{error}",
            1,
        ],
        [
            "components/admin/integrations/customer-push/ValidatePayloadPanel.tsx",
            "Validation request failed: {apiError}",
            1,
        ],
    ] as const) {
        it(`${file} uses Notice danger and keeps its text`, () => {
            const s = src(file);
            expect(s).toContain(IMPORT);
            expect(s.match(/<Notice variant="danger"/gu)?.length).toBe(count);
            expect(s).toContain(text);
            expect(s).not.toMatch(/role="alert"/u);
            expect(s).not.toMatch(/border-red-\d+/u);
        });
    }
    it("the conflict banner keeps its production heading as the title", () => {
        expect(
            src("components/admin/integrations/customer-push/CreateCustomerPushSourceForm.tsx"),
        ).toContain('title="One-active-owner conflict"');
    });
    it("the forecast error card keeps its heading and is a page-load notice", () => {
        const s = src("components/capacity/ForecastCard.tsx");
        expect(s).toMatch(
            /<Notice variant="danger" live=\{false\} titleAs="h3" title="Forecast Unavailable"/u,
        );
        expect(s).not.toMatch(RED);
    });
});
