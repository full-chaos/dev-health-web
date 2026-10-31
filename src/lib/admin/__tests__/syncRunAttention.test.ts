import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_SYNC_RUN_UNIT_SUMMARY } from "@/data/syncRunDetailSample";
import { getSyncRunUnits } from "@/lib/admin/server";
import { readSyncRunAttention, SYNC_RUN_ATTENTION_CAP } from "../syncRunAttention";

vi.mock("@/lib/admin/server", () => ({ getSyncRunUnits: vi.fn() }));

const [a, b, c] = SAMPLE_SYNC_RUN_UNIT_SUMMARY.units;

describe("readSyncRunAttention", () => {
    beforeEach(() => vi.mocked(getSyncRunUnits).mockReset());

    it("asks for failed and retrying units, and for units waiting for provider capacity, each capped", async () => {
        vi.mocked(getSyncRunUnits)
            .mockResolvedValueOnce({
                data: {
                    ...SAMPLE_SYNC_RUN_UNIT_SUMMARY,
                    units: [a!, b!],
                    filtered_unit_count: 1500,
                },
            })
            .mockResolvedValueOnce({
                data: { ...SAMPLE_SYNC_RUN_UNIT_SUMMARY, units: [b!, c!], filtered_unit_count: 2 },
            });

        const result = await readSyncRunAttention("run-1");

        expect(getSyncRunUnits).toHaveBeenCalledWith("run-1", {
            status: "failed,retrying",
            limit: SYNC_RUN_ATTENTION_CAP,
            offset: 0,
        });
        expect(getSyncRunUnits).toHaveBeenCalledWith("run-1", {
            error_category: "provider_budget_contention",
            limit: SYNC_RUN_ATTENTION_CAP,
            offset: 0,
        });
        expect(result?.units.map((unit) => unit.id).sort()).toEqual([a!.id, b!.id, c!.id].sort());
        expect(result?.total).toBe(1502);
    });

    it("is null when either read fails, so a partial list is never shown as the whole", async () => {
        vi.mocked(getSyncRunUnits)
            .mockResolvedValueOnce({ data: SAMPLE_SYNC_RUN_UNIT_SUMMARY })
            .mockResolvedValueOnce({ error: "boom" });
        expect(await readSyncRunAttention("run-1")).toBeNull();
    });
});
