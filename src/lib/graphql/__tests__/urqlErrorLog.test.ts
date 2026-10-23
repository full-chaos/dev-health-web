import { beforeEach, describe, expect, it, vi } from "vitest";

const { warn, error } = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn, error, debug: vi.fn() } }));

import { logOperationError } from "../urqlExchanges";

const operation = {
    kind: "query",
    query: { definitions: [{ name: { value: "SampleOp" } }] },
} as never;

describe("urql error log fields", () => {
    beforeEach(() => {
        warn.mockClear();
        error.mockClear();
    });

    it("logs GraphQL errors as a count and codes, never served text", () => {
        const served = "value sample-served-text-5521 rejected";
        logOperationError(
            {
                graphQLErrors: [
                    {
                        message: served,
                        path: ["a", "b"],
                        extensions: { code: "BAD_INPUT", note: served },
                    },
                    { message: served, extensions: { code: 42 } },
                ],
            } as never,
            operation,
        );
        expect(warn).toHaveBeenCalledTimes(1);
        const fields = warn.mock.calls[0][0] as Record<string, unknown>;
        expect(fields).toEqual({
            operation: "query:SampleOp",
            graphQLErrorCount: 2,
            graphQLErrorCodes: ["BAD_INPUT"],
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain("5521");
    });
});
