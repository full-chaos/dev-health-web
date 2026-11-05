import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const nav = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));
vi.mock("@/components/admin/AdminTabs", () => ({
    AdminNavProvider: ({
        children,
        ...props
    }: { readonly children: ReactNode } & Record<string, unknown>) => {
        nav.props.push(props);
        return <>{children}</>;
    },
}));
const status = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/impersonationStatusMemo", () => ({ readImpersonationStatus: status.read }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function asUser(user: Record<string, unknown>) {
    requireSessionMock.mockResolvedValue({
        access_token: "tok-1",
        user: { id: "admin-1", org_id: "org-1", ...user },
    });
}

describe("AppLayout platform admin flag under AUTHZ_PLATFORM_UI", () => {
    beforeEach(() => {
        nav.props.length = 0;
        status.read.mockReset();
        status.read.mockResolvedValue({ is_impersonating: false });
        getOrgEntitlementsMock.mockResolvedValue({
            data: { features: {}, is_valid: true, limits: {}, tier: "community" },
        });
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it.each([undefined, "off", "shadow"])(
        "C3/C4 %j: an impersonating superuser keeps the platform rows, as today",
        async (value) => {
            if (value !== undefined) vi.stubEnv("AUTHZ_PLATFORM_UI", value);
            asUser({ is_superuser: true, is_impersonating: true });
            render(await AppLayout({ children: <span>page</span> }));
            expect(nav.props).toEqual([{ isPlatformAdmin: true, impersonationLimited: false }]);
            expect(status.read).not.toHaveBeenCalled();
        },
    );

    it.each([undefined, "off", "shadow"])(
        "C3/C4 %j: the render is the same with and without impersonation",
        async (value) => {
            if (value !== undefined) vi.stubEnv("AUTHZ_PLATFORM_UI", value);
            asUser({ is_superuser: true, is_impersonating: false });
            const a = render(await AppLayout({ children: <span>page</span> }));
            const html = a.container.innerHTML;
            a.unmount();
            asUser({ is_superuser: true, is_impersonating: true });
            const b = render(await AppLayout({ children: <span>page</span> }));
            expect(b.container.innerHTML).toBe(html);
        },
    );

    it("C6 enforce: an impersonating superuser gets no platform rows and the limit flag", async () => {
        vi.stubEnv("AUTHZ_PLATFORM_UI", "enforce");
        asUser({ is_superuser: true, is_impersonating: true });
        render(await AppLayout({ children: <span>page</span> }));
        expect(nav.props).toEqual([{ isPlatformAdmin: false, impersonationLimited: true }]);
    });

    it("C5 enforce: a superuser that is not impersonating keeps the platform rows", async () => {
        vi.stubEnv("AUTHZ_PLATFORM_UI", "enforce");
        asUser({ is_superuser: true, is_impersonating: false });
        render(await AppLayout({ children: <span>page</span> }));
        expect(nav.props).toEqual([{ isPlatformAdmin: true, impersonationLimited: false }]);
    });

    // D6720 (acp Q2 (i)): the session field from the delegated token fields alone decides; an
    // unknown status changes nothing and is not read.
    it("C11 enforce: an unknown status changes nothing", async () => {
        vi.stubEnv("AUTHZ_PLATFORM_UI", "enforce");
        status.read.mockResolvedValue(undefined);
        asUser({ is_superuser: true, is_impersonating: false });
        render(await AppLayout({ children: <span>page</span> }));
        expect(nav.props).toEqual([{ isPlatformAdmin: true, impersonationLimited: false }]);
        expect(status.read).not.toHaveBeenCalled();
    });

    it("C9 enforce: an org owner that is not a superuser has no platform rows and no limit", async () => {
        vi.stubEnv("AUTHZ_PLATFORM_UI", "enforce");
        asUser({ is_superuser: false, role: "owner", is_impersonating: false });
        render(await AppLayout({ children: <span>page</span> }));
        expect(nav.props).toEqual([{ isPlatformAdmin: false, impersonationLimited: false }]);
        expect(status.read).not.toHaveBeenCalled();
    });
});
