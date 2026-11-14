import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SocialLoginError } from "./SocialLoginError";
import { SOCIAL_REFUSAL_CODES } from "@/lib/authSocialRefusal";

// CHAOS-13756 census: every reader of a social sign-in refusal. The social-login answer is read in one place
// (the signIn callback of src/lib/auth.ts), and every code it can send to the sign-in page has its own sentence.
const SRC = join(process.cwd(), "src");
const GENERIC = "An error occurred during sign in. Please try again.";

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
        return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
    });
}

describe("the readers of a social sign-in refusal", () => {
    it("only src/lib/auth.ts calls the social-login route", () => {
        const callers = sourceFiles(SRC)
            .filter((path) => readFileSync(path, "utf8").includes("/api/v1/auth/social-login"))
            .map((path) => relative(process.cwd(), path));
        expect(callers).toEqual(["src/lib/auth.ts"]);
    });

    it("the social-login answer is read only by the signIn path, never by jwt", () => {
        const auth = readFileSync(join(SRC, "lib/auth.ts"), "utf8");
        const jwtBody = auth.slice(auth.indexOf("async jwt("), auth.indexOf("async session("));
        expect(jwtBody).not.toContain("social-login");
        expect(jwtBody).not.toContain("detail?.message");
    });

    it.each(SOCIAL_REFUSAL_CODES)("%s has its own sign-in page sentence", (code) => {
        const { container } = render(<SocialLoginError error={code} />);
        expect(container.textContent).not.toBe("");
        expect(container.textContent).not.toBe(GENERIC);
    });
});
