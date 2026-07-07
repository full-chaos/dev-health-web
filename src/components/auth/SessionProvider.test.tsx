import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SessionProvider } from "./SessionProvider";

const { nextAuthProviderSpy } = vi.hoisted(() => ({
    nextAuthProviderSpy: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
    SessionProvider: ({ children }: { readonly children: ReactNode }) => {
        nextAuthProviderSpy();
        return <div data-testid="next-auth-provider">{children}</div>;
    },
}));

describe("SessionProvider", () => {
    it("wraps children with the NextAuth provider", () => {
        render(
            <SessionProvider>
                <span>App shell</span>
            </SessionProvider>,
        );

        expect(screen.getByText("App shell")).toBeInTheDocument();
        expect(screen.getByTestId("next-auth-provider")).toBeInTheDocument();
        expect(nextAuthProviderSpy).toHaveBeenCalledOnce();
    });
});
