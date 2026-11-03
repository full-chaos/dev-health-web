import { vi } from "vitest";

// A test that waits on a server deadline must not race the host: the deadline timers and Date are
// faked, real I/O (module loads, streams) is not. The clock only moves when the test moves it, and
// each step first lets the real work settle, so a slow host cannot fire a deadline early.
const realTick = () => new Promise<void>((resolve) => setImmediate(resolve));

export function useDeadlineClock(): void {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
}

export function releaseDeadlineClock(): void {
    vi.useRealTimers();
}

/** Let real work settle, move the fake clock by `ms`, let the work it woke settle. */
export async function advance(ms: number): Promise<void> {
    await realTick();
    await vi.advanceTimersByTimeAsync(ms);
    await realTick();
}
