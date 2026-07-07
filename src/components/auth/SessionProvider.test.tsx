import { render, screen } from "@testing-library/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionProvider } from "./SessionProvider";

const { nextAuthProviderSpy } = vi.hoisted(() => ({
    nextAuthProviderSpy: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
    SessionProvider: ({
        children,
        session,
    }: {
        readonly children: ReactNode;
        readonly session?: Session | null;
    }) => {
        nextAuthProviderSpy({ session });
        return <div data-testid="next-auth-provider">{children}</div>;
    },
}));

describe("SessionProvider", () => {
    it("forwards the server-loaded session while rendering children", () => {
        const session = {
            user: {
                id: "user-1",
                email: "user@example.com",
                org_id: "org-1",
                role: "owner",
                is_superuser: false,
                permissions: ["read"],
                needs_onboarding: false,
            },
            access_token: "access-token",
            expires: "2099-01-01T00:00:00.000Z",
        } satisfies Session;

        render(
            <SessionProvider session={session}>
                <span>App shell</span>
            </SessionProvider>,
        );

        expect(screen.getByText("App shell")).toBeInTheDocument();
        expect(screen.getByTestId("next-auth-provider")).toBeInTheDocument();
        expect(nextAuthProviderSpy).toHaveBeenCalledWith({ session });
    });
});
