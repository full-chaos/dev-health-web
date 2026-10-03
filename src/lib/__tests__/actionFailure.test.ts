import { afterEach, describe, expect, it, vi } from "vitest";

const logged = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: logged.error } }));

import {
    ACTION_FAILED_MESSAGE,
    UserFacingActionError,
    actionFailureMessage,
    failureFromError,
    failureResult,
    isValidationStatus,
} from "@/lib/actionFailure";
import { AdminApiError } from "@/lib/admin/api";

const HOSTILE =
    "[GraphQL] capacityForecast is served by query-api and has no Python implementation (cmd/query-api/query_route.go)";

describe("isValidationStatus", () => {
    it("is true for a 4xx except 401/403 and nothing else", () => {
        for (const s of [400, 404, 409, 422, 429]) expect(isValidationStatus(s)).toBe(true);
        for (const s of [undefined, 200, 301, 401, 403, 500, 502]) {
            expect(isValidationStatus(s)).toBe(false);
        }
    });
});

describe("failureResult", () => {
    afterEach(() => logged.error.mockReset());

    it("an action shows the served text only for a validation status", () => {
        expect(failureResult("action", "save", { status: 422, served: "CIDR is invalid" })).toEqual(
            { error: "CIDR is invalid", status: 422 },
        );
        for (const status of [401, 403, 500, 502, undefined]) {
            const out = failureResult("action", "save", { status, served: HOSTILE });
            expect(out.error).toBe(ACTION_FAILED_MESSAGE);
            expect(out.error).not.toContain("query-api");
        }
    });

    it("a read never shows served text, even for a 4xx", () => {
        expect(failureResult("read", "load", { status: 404, served: HOSTILE }).error).toBe(
            "Could not be read",
        );
    });

    it("a plan-gate sentence passes through for a 403", () => {
        const gate = "This feature requires the Team plan.";
        expect(failureResult("action", "save", { status: 403, served: gate }).error).toBe(gate);
    });

    it("logs the raw detail with the operation name", () => {
        failureResult("action", "save", { status: 500, served: HOSTILE, error: new Error("x") });
        expect(logged.error).toHaveBeenCalledTimes(1);
        const [obj] = logged.error.mock.calls[0] as [{ operation: string }];
        expect(obj.operation).toBe("save");
    });
});

describe("failureFromError", () => {
    it("treats a GET AdminApiError as a read and a PATCH one as an action", () => {
        expect(
            failureFromError("op", new AdminApiError(404, "Not Found", HOSTILE, "GET")).error,
        ).toBe("Could not be read");
        expect(
            failureFromError("op", new AdminApiError(422, "Unprocessable", "Name taken", "PATCH")),
        ).toEqual({ error: "Name taken", status: 422 });
        expect(failureFromError("op", new AdminApiError(500, "Boom", HOSTILE, "PATCH")).error).toBe(
            ACTION_FAILED_MESSAGE,
        );
    });

    it("shows an app-authored sentence as is, and hides any other thrown error", () => {
        expect(failureFromError("op", new UserFacingActionError(403, "Not available.")).error).toBe(
            "Not available.",
        );
        expect(failureFromError("op", new Error(HOSTILE)).error).toBe(ACTION_FAILED_MESSAGE);
    });
});

describe("actionFailureMessage", () => {
    it("returns the plain sentence and logs the error", () => {
        const err = new Error(HOSTILE);
        expect(actionFailureMessage(err, "createSavedReport")).toBe(ACTION_FAILED_MESSAGE);
        expect(logged.error).toHaveBeenCalled();
    });
});
