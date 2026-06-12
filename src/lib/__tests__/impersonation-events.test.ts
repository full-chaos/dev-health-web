// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    broadcastImpersonationEvent,
    IMPERSONATION_CHANNEL,
    IMPERSONATION_WINDOW_NAME,
    isImpersonationWindow,
    onImpersonationEvent,
    openImpersonationWindow,
    type ImpersonationEvent,
} from "@/lib/impersonation-events";

class FakeBroadcastChannel {
    static instances: FakeBroadcastChannel[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    posted: unknown[] = [];
    closed = false;

    constructor(public name: string) {
        FakeBroadcastChannel.instances.push(this);
    }

    postMessage(data: unknown): void {
        this.posted.push(data);
    }

    close(): void {
        this.closed = true;
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
    FakeBroadcastChannel.instances = [];
    window.name = "";
});

describe("impersonation-events", () => {
    it("broadcasts on the shared channel and closes it", () => {
        vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);

        broadcastImpersonationEvent({ type: "stopped" });

        const channel = FakeBroadcastChannel.instances[0];
        expect(channel.name).toBe(IMPERSONATION_CHANNEL);
        expect(channel.posted).toEqual([{ type: "stopped" }]);
        expect(channel.closed).toBe(true);
    });

    it("delivers only well-formed events to subscribers", () => {
        vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
        const received: ImpersonationEvent[] = [];

        const unsubscribe = onImpersonationEvent((event) => received.push(event));
        const channel = FakeBroadcastChannel.instances[0];

        channel.onmessage?.({ data: { type: "started" } } as MessageEvent);
        channel.onmessage?.({ data: { type: "bogus" } } as MessageEvent);
        channel.onmessage?.({ data: null } as MessageEvent);

        expect(received).toEqual([{ type: "started" }]);
        unsubscribe();
        expect(channel.closed).toBe(true);
    });

    it("is a no-op without BroadcastChannel support", () => {
        vi.stubGlobal("BroadcastChannel", undefined);

        expect(() => broadcastImpersonationEvent({ type: "started" })).not.toThrow();
        expect(onImpersonationEvent(() => {})).toBeTypeOf("function");
    });

    it("identifies the impersonation tab by window.name", () => {
        expect(isImpersonationWindow()).toBe(false);
        window.name = IMPERSONATION_WINDOW_NAME;
        expect(isImpersonationWindow()).toBe(true);
    });

    it("opens the named tab via window.open", () => {
        const openSpy = vi
            .spyOn(window, "open")
            .mockReturnValue({ closed: false } as unknown as Window);

        const result = openImpersonationWindow();

        expect(openSpy).toHaveBeenCalledWith("", IMPERSONATION_WINDOW_NAME);
        expect(result).not.toBeNull();
        openSpy.mockRestore();
    });
});
