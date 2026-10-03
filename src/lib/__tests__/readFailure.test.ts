import { afterEach, describe, expect, it, vi } from "vitest";

const logged = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: logged.error } }));

import { READ_FAILED_MESSAGE, readFailureMessage } from "@/lib/readFailure";

const HOSTILE =
    "[GraphQL] capacityForecast is served by query-api and has no Python implementation. The Go dispatcher did not intercept this request: verify the go_api_routing_state row ... (cmd/query-api/query_route.go)";

describe("readFailureMessage", () => {
    afterEach(() => logged.error.mockReset());

    it("returns the one plain sentence and never the backend text", () => {
        const out = readFailureMessage(new Error(HOSTILE), "capacityForecast");
        expect(out).toBe("Could not be read");
        expect(out).toBe(READ_FAILED_MESSAGE);
        expect(out).not.toContain("query-api");
    });

    it("sends the error and the operation name to the log", () => {
        const err = new Error(HOSTILE);
        readFailureMessage(err, "capacityForecast");
        expect(logged.error).toHaveBeenCalledTimes(1);
        const [obj] = logged.error.mock.calls[0] as [{ err: unknown; operation: string }];
        expect(obj.err).toBe(err);
        expect(obj.operation).toBe("capacityForecast");
    });

    it("accepts a non-Error value", () => {
        expect(readFailureMessage(HOSTILE, "op")).toBe("Could not be read");
        expect(readFailureMessage(undefined, "op")).toBe("Could not be read");
    });
});
