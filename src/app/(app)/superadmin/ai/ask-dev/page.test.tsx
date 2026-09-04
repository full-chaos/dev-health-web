import { render, screen } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSuperuserMock, panelSpy } = vi.hoisted(() => ({
    requireSuperuserMock: vi.fn(),
    panelSpy: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    requireSuperuser: requireSuperuserMock,
}));
vi.mock("@/lib/admin/server", () => ({
    getPlatformAskDevReadiness: vi.fn(),
    runPlatformAskDevReadiness: vi.fn(),
}));
vi.mock("@/components/admin/platform/PlatformAskDevReadinessPanel", () => ({
    PlatformAskDevReadinessPanel: (props: unknown) => {
        panelSpy(props);
        return (
            <section aria-label="Platform Ask Dev readiness">Platform Ask Dev readiness</section>
        );
    },
}));

import PlatformAskDevReadinessPage from "./page";
import { getPlatformAskDevReadiness, runPlatformAskDevReadiness } from "@/lib/admin/server";

describe("PlatformAskDevReadinessPage", () => {
    beforeEach(() => {
        panelSpy.mockClear();
        requireSuperuserMock.mockReset();
        requireSuperuserMock.mockResolvedValue({
            user: { id: "superuser-1", is_superuser: true },
        });
    });

    it("gates on requireSuperuser with this route's own callback URL before rendering", async () => {
        render(await PlatformAskDevReadinessPage());

        expect(requireSuperuserMock).toHaveBeenCalledWith("/superadmin/ai/ask-dev");
        expect(
            screen.getByRole("region", { name: "Platform Ask Dev readiness" }),
        ).toBeInTheDocument();
        expect(panelSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                loadAction: getPlatformAskDevReadiness,
                runAction: runPlatformAskDevReadiness,
            }),
        );
    });

    it("propagates the redirect thrown by requireSuperuser instead of rendering the panel", async () => {
        const redirectError = new Error("NEXT_REDIRECT");
        requireSuperuserMock.mockRejectedValue(redirectError);

        await expect(PlatformAskDevReadinessPage()).rejects.toThrow("NEXT_REDIRECT");
        expect(panelSpy).not.toHaveBeenCalled();
    });
});
