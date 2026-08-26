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

    it("on a successful trigger, leaves isSyncing/liveStatus set until freshnessSignal actually changes", async () => {
        vi.mocked(triggerSync).mockResolvedValue({ data: { sync_run_id: "run-1" } });

        const { result, rerender } = renderHook(
            ({ freshnessSignal }) => useSyncTrigger("cfg-1", freshnessSignal),
            { initialProps: { freshnessSignal: "2026-08-26T00:00:00.000Z" as string | null } },
        );

        act(() => {
            result.current.trigger();
        });

        // Immediately optimistic.
        expect(result.current.isSyncing).toBe(true);
        expect(result.current.liveStatus).toBe("running");

        await waitFor(() => expect(triggerSync).toHaveBeenCalledWith("cfg-1"));
        await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));

        // The trigger POST has resolved and the single router.refresh() has
        // fired, but the caller hasn't yet passed a freshnessSignal that
        // differs from what it was at trigger time — nothing proves the run
        // actually finished, so the row must stay disabled/optimistic.
        // Re-rendering with the SAME freshnessSignal (e.g. a Refresh click
        // whose fetch simply hasn't caught up to the sync yet) must not
        // clear it either.
        rerender({ freshnessSignal: "2026-08-26T00:00:00.000Z" });
        expect(result.current.isSyncing).toBe(true);
        expect(result.current.liveStatus).toBe("running");

        // Only once freshnessSignal actually changes (the backend persisted
        // a completed attempt) does it clear.
        rerender({ freshnessSignal: "2026-08-26T00:05:00.000Z" });
        expect(result.current.isSyncing).toBe(false);
        expect(result.current.liveStatus).toBeNull();
    });

    it("never clears from a freshnessSignal change while no trigger is outstanding", () => {
        const { result, rerender } = renderHook(
            ({ freshnessSignal }) => useSyncTrigger("cfg-1", freshnessSignal),
            { initialProps: { freshnessSignal: "2026-08-26T00:00:00.000Z" as string | null } },
        );

        expect(result.current.isSyncing).toBe(false);
        expect(result.current.liveStatus).toBeNull();

        // An unrelated prop change (e.g. some OTHER config's sync finishing
        // and refreshing the whole table) must not touch a row that never
        // triggered anything.
        rerender({ freshnessSignal: "2026-08-26T00:05:00.000Z" });
        expect(result.current.isSyncing).toBe(false);
        expect(result.current.liveStatus).toBeNull();
    });

    it("on a trigger error response, clears isSyncing/liveStatus immediately so the operator can retry", async () => {
        vi.mocked(triggerSync).mockResolvedValue({ error: "Denied" });

        const { result } = renderHook(() => useSyncTrigger("cfg-1", null));

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

        const { result } = renderHook(() => useSyncTrigger("cfg-1", null));

        act(() => {
            result.current.trigger();
        });
        expect(result.current.isSyncing).toBe(true);

        await waitFor(() => expect(result.current.isSyncing).toBe(false));
        expect(result.current.liveStatus).toBeNull();
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it("CHAOS-4318 round-3: an unrelated freshnessSignal change while the trigger POST is still pending does not unlock early", async () => {
        let resolveTrigger!: (value: { data: { sync_run_id: string } }) => void;
        vi.mocked(triggerSync).mockReturnValue(
            new Promise((resolve) => {
                resolveTrigger = resolve;
            }),
        );

        const { result, rerender } = renderHook(
            ({ freshnessSignal }) => useSyncTrigger("cfg-1", freshnessSignal),
            { initialProps: { freshnessSignal: "2026-08-26T00:00:00.000Z" as string | null } },
        );

        act(() => {
            result.current.trigger();
        });
        expect(result.current.isSyncing).toBe(true);

        // e.g. a scheduled run for this same config lands, or a Refresh
        // click elsewhere on the page, WHILE our own POST is still in
        // flight — this must not unlock the button ahead of our own
        // request settling (that would let a second click enqueue a
        // duplicate run for the trigger that's still executing).
        rerender({ freshnessSignal: "2026-08-26T00:05:00.000Z" });
        expect(result.current.isSyncing).toBe(true);
        expect(result.current.liveStatus).toBe("running");

        await act(async () => {
            resolveTrigger({ data: { sync_run_id: "run-1" } });
        });
        await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));

        // Now that our own request has resolved, the SAME already-changed
        // freshnessSignal is honored on the next render.
        rerender({ freshnessSignal: "2026-08-26T00:05:00.000Z" });
        expect(result.current.isSyncing).toBe(false);
        expect(result.current.liveStatus).toBeNull();
    });

    it("CHAOS-4318 round-3: a trigger accepted but never dispatched (no run id) clears immediately — nothing to wait for", async () => {
        vi.mocked(triggerSync).mockResolvedValue({ data: {} });

        const { result } = renderHook(() => useSyncTrigger("cfg-1", "2026-08-26T00:00:00.000Z"));

        act(() => {
            result.current.trigger();
        });
        expect(result.current.isSyncing).toBe(true);

        await waitFor(() => expect(result.current.isSyncing).toBe(false));
        expect(result.current.liveStatus).toBeNull();
        expect(mockRefresh).toHaveBeenCalledTimes(1);
    });

    it("fires exactly one trigger request and one refresh — no repeat calls of either", async () => {
        vi.mocked(triggerSync).mockResolvedValue({ data: { sync_run_id: "run-1" } });

        const { result } = renderHook(() => useSyncTrigger("cfg-1", null));
        act(() => {
            result.current.trigger();
        });
        await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));

        expect(triggerSync).toHaveBeenCalledTimes(1);
        expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
});
