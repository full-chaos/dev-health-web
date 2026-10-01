import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const NOT_RED_BANNER = (l: string) => !/(?:bg|border)-red-\d+/u.test(l);

describe("auth forms class mappings", () => {
    it("success and warning notes, strength check and menu link use theme tokens", () => {
        for (const f of [
            "components/auth/LoginForm.tsx",
            "components/auth/ForgotPasswordForm.tsx",
            "components/auth/ResetPasswordForm.tsx",
            "components/auth/PasswordStrength.tsx",
            "components/auth/UserMenu.tsx",
            "components/navigation/OrgSwitcher.tsx",
            "components/capacity/InsufficientHistoryNotice.tsx",
            "app/(auth)/auth/onboard/complete/page.tsx",
        ]) {
            expect(src(f).split("\n").filter(NOT_RED_BANNER).join("\n"), f).not.toMatch(
                /\b(?:text|bg|border)-(?:green|amber|purple|red)-\d{2,3}/u,
            );
        }
        expect(src("components/auth/ForgotPasswordForm.tsx")).toContain("text-(--positive)");
        expect(src("components/auth/LoginForm.tsx")).toContain("text-(--caution)");
    });
});
