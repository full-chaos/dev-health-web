import { afterEach, describe, expect, it, vi } from "vitest";

import { V10_PRIVACY_BASELINE, attachBeforeSend } from "../scrubber";

const { init, lazyLoadIntegration } = vi.hoisted(() => ({
    init: vi.fn(),
    lazyLoadIntegration: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@sentry/nextjs", () => ({
    init,
    lazyLoadIntegration,
    addIntegration: vi.fn(),
    httpIntegration: vi.fn(() => ({})),
    withStaticSpan: <T extends object>(callback: T): T =>
        Object.defineProperty(callback, "_static", { value: true, enumerable: false }),
}));

type InitConfig = Record<string, unknown> & {
    beforeSendSpan: ((span: unknown) => unknown) & { _static?: boolean };
    dataCollection: Record<string, unknown>;
};

async function initConfigFor(file: string): Promise<InitConfig> {
    vi.resetModules();
    init.mockClear();
    await import(/* @vite-ignore */ file);
    expect(init).toHaveBeenCalledTimes(1);
    return init.mock.calls[0][0] as InitConfig;
}

describe("v10 privacy baseline", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("switches off every v11 default that collects more than v10 did", () => {
        expect(V10_PRIVACY_BASELINE.dataCollection).toMatchObject({
            userInfo: false,
            cookies: false,
            httpBodies: [],
            genAI: { inputs: false, outputs: false },
            databaseQueryData: false,
            queues: false,
            graphQL: { document: false, variables: false },
        });
        expect(V10_PRIVACY_BASELINE.traceLifecycle).toBe("static");
        expect(V10_PRIVACY_BASELINE.attachStacktrace).toBe(false);
    });

    it.each([
        ["server", "../../../../sentry.server.config"],
        ["edge", "../../../../sentry.edge.config"],
    ])("applies the baseline and the scrub hooks in the %s init", async (_name, file) => {
        const config = await initConfigFor(file);

        expect(config.traceLifecycle).toBe("static");
        expect(config.attachStacktrace).toBe(false);
        expect(config.dataCollection).toEqual(V10_PRIVACY_BASELINE.dataCollection);
        expect(config.beforeSendSpan._static).toBe(true);
        expect(typeof config.beforeSend).toBe("function");
    });

    it("attachBeforeSend adds the baseline to a bare config", () => {
        const config = attachBeforeSend({ dsn: "https://fake@sentry.io/1" });
        expect(config.dataCollection).toEqual(V10_PRIVACY_BASELINE.dataCollection);
    });

    it("adds the user privacy integration and keeps the caller integrations", () => {
        const own = { name: "Own" };
        const asArray = attachBeforeSend({ integrations: [own] as never });
        const names = (asArray.integrations as Array<{ name: string }>).map((i) => i.name);
        expect(names).toEqual(["Own", "UserPrivacy"]);

        const asFunction = attachBeforeSend({
            integrations: ((defaults: unknown[]) => [...defaults, own]) as never,
        });
        const fromFunction = (asFunction.integrations as (d: unknown[]) => Array<{ name: string }>)(
            [{ name: "Default" }],
        ).map((i) => i.name);
        expect(fromFunction).toEqual(["Default", "Own", "UserPrivacy"]);

        const bare = attachBeforeSend({});
        expect((bare.integrations as Array<{ name: string }>).map((i) => i.name)).toEqual([
            "UserPrivacy",
        ]);
    });

    it("scrubs a log and a metric and runs the caller hooks after the scrub", () => {
        const seenLog: unknown[] = [];
        const seenMetric: unknown[] = [];
        const config = attachBeforeSend({
            beforeSendLog: (log) => (seenLog.push(log), log),
            beforeSendMetric: (metric) => (seenMetric.push(metric), metric),
        });
        const email = ["hook-user", "example.test"].join("@");
        const log = config.beforeSendLog?.({
            level: "info",
            message: `for ${email}`,
            attributes: {
                "user.id": { value: "u1", type: "string" },
                "user.email": { value: email, type: "string" },
                "user.name": { value: "n", type: "string" },
                "enduser.email": { value: email, type: "string" },
                "enduser.id": { value: "e1", type: "string" },
                "enduser.pseudo_id": { value: "e2", type: "string" },
                who: { value: email, type: "string" },
            },
        } as never);
        const metric = config.beforeSendMetric?.({
            name: "m",
            value: 1,
            type: "counter",
            attributes: {
                "user.id": { value: "u1", type: "string" },
                "user.email": { value: email, type: "string" },
                "enduser.email": { value: email, type: "string" },
                "enduser.id": { value: "e1", type: "string" },
                who: { value: email, type: "string" },
            },
        } as never);
        for (const out of [log, metric, ...seenLog, ...seenMetric]) {
            expect(JSON.stringify(out)).not.toContain(email);
            expect(JSON.stringify(out)).not.toContain("user.email");
            expect(JSON.stringify(out)).not.toContain("user.name");
            expect(JSON.stringify(out)).not.toContain("enduser");
            expect(JSON.stringify(out)).toContain("user.id");
        }
        expect(seenLog).toHaveLength(1);
        expect(seenMetric).toHaveLength(1);
    });

    it("keeps the remaining baseline keys when a caller sets a partial dataCollection", () => {
        const config = attachBeforeSend({
            dsn: "https://fake@example.invalid/1",
            dataCollection: { userInfo: true },
        });
        expect(config.dataCollection).toEqual({
            ...V10_PRIVACY_BASELINE.dataCollection,
            userInfo: true,
        });
        expect(config.dataCollection?.cookies).toBe(false);
    });

    it("keeps frameContextLines at the v10 value", () => {
        expect(V10_PRIVACY_BASELINE.dataCollection.frameContextLines).toBe(7);
    });
});
