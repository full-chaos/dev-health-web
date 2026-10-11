import { beforeEach, describe, expect, it, vi } from "vitest";

const { listSettingCategories, listSettings } = vi.hoisted(() => ({
    listSettingCategories: vi.fn(),
    listSettings: vi.fn(),
}));

vi.mock("@/lib/admin/server", () => ({ listSettingCategories, listSettings }));
vi.mock("@/components/admin/AdminHeader", () => ({
    AdminHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import { render, screen } from "@/test/utils";

import SettingsPage from "./page";

describe("Platform settings page reads (CHAOS-9274)", () => {
    beforeEach(() => {
        listSettingCategories.mockReset();
        listSettings.mockReset();
        listSettingCategories.mockResolvedValue({
            data: ["general", "github", "llm", "ask_dev", "sync"],
        });
        listSettings.mockResolvedValue({ data: [] });
    });

    it("never reads the categories the backend refuses on the generic settings read", async () => {
        render(await SettingsPage());
        const asked = listSettings.mock.calls.map((call) => call[0]);
        expect(asked).toEqual(["general", "github", "sync"]);
    });

    it("still shows the other categories", async () => {
        render(await SettingsPage());
        expect(screen.getByText("General")).toBeInTheDocument();
        expect(screen.queryByText("Llm")).toBeNull();
    });
});
