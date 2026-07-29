import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

const { bodySpy, getCurrentOrgMock } = vi.hoisted(() => ({
    bodySpy: vi.fn(),
    getCurrentOrgMock: vi.fn(),
}));
const listAuthorizedRepositoriesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: getCurrentOrgMock,
}));
vi.mock("@/lib/acr/service", () => ({
    listAuthorizedRepositories: listAuthorizedRepositoriesMock,
}));
vi.mock("@/lib/fetchOrNull", () => ({
    fetchOrNull: async <T,>(value: Promise<T>) => value,
}));
vi.mock("@/app/(app)/agent-context/context-packet/_components/ContextPacketGatedBody", () => ({
    ContextPacketGatedBody: (props: unknown) => {
        bodySpy(props);
        return <div data-testid="context-fabric-validator" />;
    },
}));

import ContextFabricValidationPage from "./page";

describe("ContextFabricValidationPage", () => {
    beforeEach(() => {
        bodySpy.mockClear();
        listAuthorizedRepositoriesMock.mockClear();
        getCurrentOrgMock.mockResolvedValue({ data: { id: "org-1" } });
        listAuthorizedRepositoriesMock.mockResolvedValue(["full-chaos/dev-health"]);
        vi.stubEnv("DEV_HEALTH_TEST_MODE", "false");
    });

    afterEach(() => vi.unstubAllEnvs());

    it("keeps platform validation independent from Ask Dev and agent runtime entitlements", async () => {
        render(await ContextFabricValidationPage({}));

        expect(screen.getByRole("heading", { name: "Context Fabric Validation" })).toBeVisible();
        expect(bodySpy).toHaveBeenCalledWith(
            expect.objectContaining({
                enabled: true,
                live: true,
                showRetrievalDebug: true,
                repositoryCatalog: {
                    kind: "ready",
                    repositories: ["full-chaos/dev-health"],
                },
            }),
        );
    });

    it("keeps the validation surface available when the authorized catalog is empty", async () => {
        listAuthorizedRepositoriesMock.mockResolvedValue([]);

        render(await ContextFabricValidationPage({}));

        expect(bodySpy).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: true, repositoryCatalog: { kind: "empty" } }),
        );
    });
});
