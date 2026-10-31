/**
 * A stand-in for `@/lib/echartsInit` in jsdom tests, which have no canvas (CHAOS-11942). It keeps
 * ECharts' own order of events and lets a test choose how one chart behaves:
 *
 * - "sync": `setOption` emits `finished` before it returns (ECharts with animation off);
 * - "async": `finished` comes on a later timer tick (ECharts with animation);
 * - "never": `finished` never comes; "init_throws" / "set_throws": the call throws.
 *
 * The real reduced-motion path runs in the browser (tests/ask-dev-series-charts.spec.ts).
 */
import type { EChartsOption } from "echarts";

export type StubMode = "sync" | "async" | "never" | "init_throws" | "set_throws";

type Listener = () => void;

export const stub = {
    mode: "sync" as StubMode,
    /** Per-shape override by chart title is not available here; by call order instead. */
    modes: [] as StubMode[],
    options: [] as EChartsOption[],
    inits: 0,
    disposed: 0,
    reset() {
        this.mode = "sync";
        this.modes = [];
        this.options = [];
        this.inits = 0;
        this.disposed = 0;
    },
};

function fakeInit(element: HTMLElement) {
    const mode = stub.modes[stub.inits] ?? stub.mode;
    stub.inits += 1;
    if (mode === "init_throws") throw new Error("init failed");
    const listeners = new Map<string, Set<Listener>>();
    const emit = (event: string) => listeners.get(event)?.forEach((listener) => listener());
    return {
        on(event: string, listener: Listener) {
            const set = listeners.get(event) ?? new Set<Listener>();
            set.add(listener);
            listeners.set(event, set);
        },
        off(event: string, listener: Listener) {
            listeners.get(event)?.delete(listener);
        },
        setOption(option: EChartsOption) {
            if (mode === "set_throws") throw new Error("setOption failed");
            stub.options.push(option);
            element.setAttribute("data-stub-option", "set");
            if (mode === "sync") emit("finished");
            if (mode === "async") setTimeout(() => emit("finished"), 10);
        },
        resize() {},
        dispose() {
            stub.disposed += 1;
            listeners.clear();
        },
    };
}

/**
 * jsdom has no `matchMedia` either, and the chart theme and reduced-motion hooks read it. This one
 * matches only `(prefers-reduced-motion: reduce)`, while `media.reducedMotion` is true, and tells
 * its listeners when `setReducedMotion` changes it.
 */
export const media = {
    reducedMotion: false,
    listeners: new Set<() => void>(),
    setReducedMotion(value: boolean) {
        this.reducedMotion = value;
        this.listeners.forEach((listener) => listener());
    },
};

if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
        ({
            get matches() {
                return query === "(prefers-reduced-motion: reduce)" && media.reducedMotion;
            },
            media: query,
            onchange: null,
            addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
            removeEventListener: (_: string, listener: () => void) =>
                media.listeners.delete(listener),
            addListener: (listener: () => void) => media.listeners.add(listener),
            removeListener: (listener: () => void) => media.listeners.delete(listener),
            dispatchEvent: () => false,
        }) as unknown as MediaQueryList;
}

export const echartsStubModule = {
    echarts: { init: fakeInit, use: () => undefined },
};
