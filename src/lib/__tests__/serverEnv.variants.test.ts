import { afterEach, describe, expect, it } from "vitest";

import { getServerEnv as defaultReader } from "../serverEnv.default";
import { getServerEnv as serverReader } from "../serverEnv.server";

const NAMES = ["LOG_LEVEL", "BACKEND_URL", "LINEAR_API_KEY", "REDIS_URL", "TRUST_PROXY"] as const;
const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));

afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

describe("#server-env variants", () => {
    it("the server variant reads every server variable", () => {
        process.env.BACKEND_URL = "http://backend.local";
        process.env.LINEAR_API_KEY = "linear-test-value";
        process.env.REDIS_URL = "redis://cache.local";
        process.env.TRUST_PROXY = "true";

        expect(serverReader()).toMatchObject({
            BACKEND_URL: "http://backend.local",
            LINEAR_API_KEY: "linear-test-value",
            REDIS_URL: "redis://cache.local",
            TRUST_PROXY: "true",
        });
    });

    it("the default variant reads the client-graph variables", () => {
        process.env.BACKEND_URL = "http://backend.local";

        expect(defaultReader().BACKEND_URL).toBe("http://backend.local");
    });

    it("the default variant returns undefined, not an error, for an allowed variable that is unset", () => {
        delete process.env.LOG_LEVEL;

        expect(defaultReader().LOG_LEVEL).toBeUndefined();
    });

    it("the default variant refuses a server-only variable loudly and never returns its value", () => {
        process.env.LINEAR_API_KEY = "linear-test-value";
        process.env.REDIS_URL = "redis://cache.local";

        const env = defaultReader();

        expect(() => env.LINEAR_API_KEY).toThrow(/not available in a client module graph/);
        expect(() => env.REDIS_URL).toThrow(/not available in a client module graph/);
    });
});
