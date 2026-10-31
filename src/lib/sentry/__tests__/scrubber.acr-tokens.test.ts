import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { scrubBreadcrumb, scrubEvent } from "../scrubber";
import { scrubTelemetryPayload, scrubTelemetryText } from "../scrubber-value";

/**
 * CHAOS-12304 (c3; design §7): ACR's browser tokens never reach telemetry. The access token
 * `fcacr_` and the refresh token `acrrt_` are filtered wherever they appear in text, not only after
 * `Bearer ` or a `token=` name.
 */
const ACCESS = `fcacr_${"A1b2".repeat(10)}xyz`;
const REFRESH = `acrrt_${"R9-_".repeat(10)}abc`;

describe("Sentry scrubbing of ACR browser tokens", () => {
    it.each([
        ["bare access token", `failed with ${ACCESS}`],
        ["bare refresh token", `family ${REFRESH} revoked`],
        ["in a query value", `/x?t=${ACCESS}&y=1`],
        ["in JSON", JSON.stringify({ t: REFRESH })],
    ])("filters a %s", (_, text) => {
        const scrubbed = scrubTelemetryText(text);
        expect(scrubbed).not.toMatch(/fcacr_[A-Za-z0-9_-]|acrrt_[A-Za-z0-9_-]/u);
        // In a URL the marker is percent-encoded (`%5BFiltered%5D`).
        expect(scrubbed).toMatch(/Filtered/u);
    });

    it("filters both from an event message and a breadcrumb", () => {
        const event = scrubEvent({
            type: undefined,
            message: `${ACCESS} ${REFRESH}`,
        } as ErrorEvent);
        expect(JSON.stringify(event)).not.toMatch(/fcacr_[A-Za-z0-9]|acrrt_[A-Za-z0-9]/u);
        const crumb = scrubBreadcrumb({ message: `refresh ${REFRESH}` });
        expect(JSON.stringify(crumb)).not.toMatch(/acrrt_[A-Za-z0-9]/u);
    });

    it("filters a token used as a property name, nested too (r1)", () => {
        const payload = scrubTelemetryPayload({
            [ACCESS]: "telemetry",
            nested: { [REFRESH]: { kept: "value" } },
        });
        expect(JSON.stringify(payload)).not.toMatch(/fcacr_[A-Za-z0-9]|acrrt_[A-Za-z0-9]/u);
        expect(JSON.stringify(payload)).toContain("value");
        const event = scrubEvent({ type: undefined, extra: { [REFRESH]: 1 } } as ErrorEvent);
        expect(JSON.stringify(event)).not.toMatch(/acrrt_[A-Za-z0-9]/u);
    });

    it("does not take a token shape in code for a token", () => {
        const scrubbed = scrubTelemetryText(
            "pattern fcacr_[A-Za-z0-9_-]{43} and acrrt_[A-Za-z0-9_-]{43}",
        );
        expect(scrubbed).not.toContain("[Filtered]");
        expect(scrubbed).toContain("fcacr_[");
    });
});
