import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncTrigger } from "./useSyncTrigger";
import { triggerSync } from "@/lib/admin/server";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/lib/admin/server", () => ({
    triggerSync: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

describe("useSyncTrigger — CHAOS-4318 (no client-side status polling)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("on a successful trigger, leaves isSyncing/liveStatus set (does NOT clear once the POST resolves)", async () => {
        vi.mocked(triggerSync).mockResolvedValue({ data: { sync_run_id: "run-1" } });

        const { result } = renderHook(() => useSyncTrigger("cfg-1"));

        act(() => {
            result.current.trigger();
        });

        // Immediately optimistic.
        expect(result.current.isSyncing).toBe(true);
        expect(result.current.liveStatus).toBe("running");

        await waitFor(() => expect(triggerSync).toHaveBeenCalledWith("cfg-1"));
        await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));

        // The trigger POST has resolved and the single router.refresh() has
        // fired, but nothing here confirms the run actually finished — the
        // row must stay disabled/optimistic (both fields still set) until an
        // explicit Refresh remounts it with the real persisted status.
        // Otherwise the button would re-enable while the badge still reads
        // "Syncing...", or a rapid second click could fire a duplicate run.
        expect(result.current.isSyncing).toBe(true);
        expect(result.current.liveStatus).toBe("running");
    });

    it("on a trigger error response, clears isSyncing/liveStatus immediately so the operator can retry", async () => {
        vi.mocked(triggerSync).mockResolvedValue({ error: "Denied" });

        const { result } = renderHook(() => useSyncTrigger("cfg-1"));

        act(() => {
            result.current.trigger();
        });
        expect(result.current.isSyncing).toBe(true);

        await waitFor(() => expect(result.current.isSyncing).toBe(false));
        expect(result.current.liveStatus).toBeNull();
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("on a thrown trigger error, clears isSyncing/liveStatus immediately so the operator can retry", async () => {
        vi.mocked(triggerSync).mockRejectedValue(new Error("network down"));

        const { result } = renderHook(() => useSyncTrigger("cfg-1"));

        act(() => {
            result.current.trigger();
        });
        expect(result.current.isSyncing).toBe(true);

        await waitFor(() => expect(result.current.isSyncing).toBe(false));
        expect(result.current.liveStatus).toBeNull();
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("fires exactly one trigger request and one refresh — no repeat calls of either", async () => {
        vi.mocked(triggerSync).mockResolvedValue({ data: { sync_run_id: "run-1" } });

        const { result } = renderHook(() => useSyncTrigger("cfg-1"));
        act(() => {
            result.current.trigger();
        });
        await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));

        expect(triggerSync).toHaveBeenCalledTimes(1);
        expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
});
