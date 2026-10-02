import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppLayout from "./layout";

const { adminTierProviderSpy, getOrgEntitlementsMock, requireSessionMock, shellSpy } = vi.hoisted(
    () => ({
        adminTierProviderSpy: vi.fn(),
        getOrgEntitlementsMock: vi.fn(),
        requireSessionMock: vi.fn(),
        shellSpy: vi.fn(),
    }),
);

vi.mock("@/lib/auth", () => ({
    requireSession: requireSessionMock,
}));

vi.mock("@/lib/admin/server/billing", () => ({
    getOrgEntitlements: getOrgEntitlementsMock,
}));

vi.mock("@/components/admin/AdminTierContext", () => ({
    AdminTierProvider: ({
        children,
        features,
        limits,
        tier,
    }: {
        readonly children: ReactNode;
        readonly features: Record<string, boolean>;
        readonly limits?: Record<string, number | null>;
        readonly tier: string;
    }) => {
        adminTierProviderSpy({ features, limits, tier });
        return <>{children}</>;
    },
}));

vi.mock("@/components/auth/SessionProvider", () => ({
    SessionProvider: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/graphql/provider", () => ({
    GraphQLProvider: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/telemetry/TelemetryProvider", () => ({
    TelemetryProvider: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
}));

// The shell (sidebar, top bar, account menu) has its own tests; here it is a stub that
// shows the layout hands it the theme toggle and the banners.
vi.mock("@/components/shell/AppShell", () => ({
    AppShell: ({
        banners,
        children,
        themeToggle,
    }: {
        readonly banners?: ReactNode;
        readonly children: ReactNode;
        readonly themeToggle?: ReactNode;
    }) => {
        shellSpy();
        return (
            <div data-testid="app-shell-stub">
                <div data-testid="shell-banners">{banners}</div>
                <div data-testid="shell-theme-slot">{themeToggle}</div>
                {children}
            </div>
        );
    },
}));
vi.mock("@/components/admin/ImpersonationBanner", () => ({ ImpersonationBanner: () => null }));
vi.mock("@/components/billing/TrialBanner", () => ({ TrialBanner: () => null }));
vi.mock("@/components/feedback/BugReportButton", () => ({ BugReportButton: () => null }));
vi.mock("sonner", () => ({ Toaster: () => null }));

describe("AppLayout entitlement wiring", () => {
    beforeEach(() => {
        adminTierProviderSpy.mockClear();
        shellSpy.mockClear();
        requireSessionMock.mockResolvedValue({
            user: { id: "user-1", org_id: "org-1", token: "secret-token" },
        });
    });

    it("passes a valid organization entitlement to the client provider without a session token", async () => {
        getOrgEntitlementsMock.mockResolvedValue({
            data: {
                features: { agent_context_runtime: true },
                is_valid: true,
                limits: { agent_context_runtime: 1 },
                tier: "enterprise",
            },
        });

        render(await AppLayout({ children: <span>App shell</span> }));

        expect(screen.getByText("App shell")).toBeInTheDocument();
        expect(getOrgEntitlementsMock).toHaveBeenCalledWith("org-1");
        expect(adminTierProviderSpy).toHaveBeenCalledWith({
            features: { agent_context_runtime: true },
            limits: { agent_context_runtime: 1 },
            tier: "enterprise",
        });
    });

    it("wraps every page in the shared app shell and gives it the theme toggle", async () => {
        getOrgEntitlementsMock.mockResolvedValue({
            data: { features: {}, is_valid: true, limits: {}, tier: "community" },
        });

        render(await AppLayout({ children: <span>Context Fabric</span> }));

        const shell = screen.getByTestId("app-shell-stub");
        expect(shell).toContainElement(screen.getByText("Context Fabric"));
        expect(screen.getByTestId("shell-theme-slot")).toContainElement(
            screen.getByTestId("theme-toggle"),
        );
        expect(shellSpy).toHaveBeenCalledOnce();
    });

    it.each([
        ["an entitlement error", { error: "unavailable" }],
        [
            "an invalid entitlement",
            {
                data: {
                    features: { agent_context_runtime: true },
                    is_valid: false,
                    limits: { agent_context_runtime: 1 },
                    tier: "enterprise",
                },
            },
        ],
    ])("fails closed when the server returns %s", async (_condition, entitlementResult) => {
        getOrgEntitlementsMock.mockResolvedValue(entitlementResult);

        render(await AppLayout({ children: <span>App shell</span> }));

        expect(adminTierProviderSpy).toHaveBeenCalledWith({
            features: {},
            limits: {},
            tier: "community",
        });
    });
});
