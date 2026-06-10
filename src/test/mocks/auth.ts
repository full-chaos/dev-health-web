/**
 * Shared vitest helpers for mocking `@/lib/auth`'s `auth()` function.
 *
 * Usage
 * -----
 *
 * Because `vi.mock()` calls are hoisted to the top of the file, you still need
 * to register the mock inline at the top of your test file:
 *
 * ```ts
 * import { vi } from "vitest";
 *
 * vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
 *
 * import { mockAuth, makeMockSession, defaultMockSession } from "@/test/mocks/auth";
 * import { functionUnderTest } from "../my-module";
 *
 * describe("functionUnderTest", () => {
 *   beforeEach(() => {
 *     vi.resetAllMocks();
 *   });
 *
 *   it("handles authenticated user", async () => {
 *     mockAuth();                                   // default session
 *     // or: mockAuth({ user: { is_superuser: true } });
 *     // or: mockAuth({ user: { org_id: "org-42" } });
 *     // or: mockAuth(null);                        // unauthenticated
 *     await functionUnderTest();
 *   });
 * });
 * ```
 *
 * For situations where you need to construct a Session without registering it
 * against the mock (for example, to pass it into a different code path), use
 * `makeMockSession(overrides?)` directly.
 */
import { vi } from "vitest";
import type { Session } from "next-auth";

import { auth } from "@/lib/auth";

export type MockSessionOverrides = {
    access_token?: string;
    expires?: string;
    error?: string;
    user?: Partial<Session["user"]>;
};

export const defaultMockSession: Session = Object.freeze({
    access_token: "test-token",
    user: Object.freeze({
        id: "user-1",
        org_id: "org-1",
    }) as Session["user"],
    expires: new Date(Date.now() + 86400000).toISOString(),
}) as Session;

export function makeMockSession(overrides: MockSessionOverrides = {}): Session {
    const { user: userOverrides, ...rest } = overrides;
    return {
        access_token: defaultMockSession.access_token,
        expires: defaultMockSession.expires,
        ...rest,
        user: {
            ...defaultMockSession.user,
            ...userOverrides,
        },
    };
}

/**
 * Configure `vi.mocked(auth)` to resolve to a Session (or `null` for
 * unauthenticated). Accepts either:
 *   - `null`           → unauthenticated
 *   - a full `Session` → used as-is
 *   - overrides object → merged onto `defaultMockSession`
 *   - `undefined`      → uses `defaultMockSession`
 *
 * Returns the resolved session (or `null`) for convenience.
 *
 * Requires `vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))` to have been
 * registered at the top of the test file.
 */
export function mockAuth(
    sessionOrOverrides?: Session | null | MockSessionOverrides,
): Session | null {
    let resolved: Session | null;
    if (sessionOrOverrides === null) {
        resolved = null;
    } else if (sessionOrOverrides && isFullSession(sessionOrOverrides)) {
        resolved = sessionOrOverrides;
    } else {
        resolved = makeMockSession(sessionOrOverrides);
    }
    vi.mocked(auth).mockResolvedValue(resolved);
    return resolved;
}

function isFullSession(value: unknown): value is Session {
    return (
        typeof value === "object" &&
        value !== null &&
        "expires" in value &&
        typeof (value as Session).expires === "string" &&
        "user" in value &&
        typeof (value as Session).user === "object" &&
        (value as Session).user !== null &&
        "id" in (value as Session).user
    );
}
