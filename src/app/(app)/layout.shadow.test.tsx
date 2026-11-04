import { render } from "@testing-library/react";
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

const shadow = vi.hoisted(() => ({
    scheduleShadow: vi.fn(),
    schedulePlatformShadow: vi.fn(),
}));
vi.mock("@/lib/auth/platform/shadow", () => ({
    schedulePlatformShadow: (...args: unknown[]) => {
        shadow.schedulePlatformShadow(...args);
    },
}));
vi.mock("@/lib/auth/shadow", () => ({
    scheduleShadow: (...args: unknown[]) => {
        shadow.scheduleShadow(...args);
    },
}));

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

const signupEmitterSpy = vi.fn();
vi.mock("@/components/telemetry/SignupCompletedEmitter", () => ({
    SignupCompletedEmitter: (props: { isNewUser: boolean; userId?: string | null }) => {
        signupEmitterSpy(props);
        return null;
    },
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

describe("AppLayout shadow wiring is advisory", () => {
    beforeEach(() => {
        shadow.scheduleShadow.mockClear();
        shadow.schedulePlatformShadow.mockClear();
        getOrgEntitlementsMock.mockResolvedValue({
            data: { features: {}, is_valid: true, limits: {}, tier: "community" },
        });
        requireSessionMock.mockResolvedValue({ user: { id: "user-1", org_id: "org-1" } });
    });

    it("schedules the nav surfaces once per switch, from the session", async () => {
        render(await AppLayout({ children: <span>page</span> }));
        expect(shadow.scheduleShadow).toHaveBeenCalledOnce();
        expect(shadow.scheduleShadow.mock.calls[0][1]).toEqual([
            "nav:platform",
            "nav:platform-billing",
        ]);
        expect(shadow.schedulePlatformShadow).toHaveBeenCalledOnce();
        expect(shadow.schedulePlatformShadow.mock.calls[0][1]).toEqual([
            "nav:platform",
            "nav:platform-billing",
        ]);
    });

    it("renders the same output whether or not the shadow call runs", async () => {
        const off = render(await AppLayout({ children: <span>page</span> }));
        const offHtml = off.container.innerHTML;
        off.unmount();
        shadow.scheduleShadow.mockClear();
        shadow.schedulePlatformShadow.mockClear();
        const again = render(await AppLayout({ children: <span>page</span> }));
        expect(again.container.innerHTML).toBe(offHtml);
    });
});
