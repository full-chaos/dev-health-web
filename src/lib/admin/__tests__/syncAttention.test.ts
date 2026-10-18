import { describe, expect, it } from "vitest";
import { datasetAttentionRows, describeDatasetAttention } from "../syncAttention";
import type { IntegrationDataset } from "../types";

function dataset(reason: string | null): IntegrationDataset {
    return {
        id: "d1",
        integration_id: "i1",
        dataset_key: "work-items",
        is_enabled: true,
        unavailable_reason: reason,
        unavailable_since: reason ? "2026-07-01T06:00:00.000Z" : null,
        unavailable_last_seen_at: reason ? "2026-07-02T06:00:00.000Z" : null,
    };
}

describe("describeDatasetAttention", () => {
    it("returns null without a marker", () => {
        expect(describeDatasetAttention(dataset(null))).toBeNull();
        expect(describeDatasetAttention(dataset(" "))).toBeNull();
    });

    it.each([
        ["needs_attention:time_limit", "A run reached its time limit."],
        ["needs_attention:result_too_large", "A result was too large to store in one run."],
        ["needs_attention:unclassified", "Runs keep failing and the cause was not recorded."],
    ])("maps %s to plain words", (reason, text) => {
        const row = describeDatasetAttention(dataset(reason));
        expect(row?.label).toBe("Needs attention");
        expect(row?.reason).toBe(text);
        expect(row?.since).toBe("2026-07-01T06:00:00.000Z");
        expect(row?.lastSeenAt).toBe("2026-07-02T06:00:00.000Z");
    });

    it("never shows the raw marker for an unknown class", () => {
        const row = describeDatasetAttention(dataset("needs_attention:odd_new_class"));
        expect(row?.label).toBe("Needs attention");
        expect(row?.reason).toBe("Runs keep failing (odd new class).");
        expect(row?.reason).not.toContain("needs_attention");
    });

    it("shows another reason as a plain sentence", () => {
        const row = describeDatasetAttention(dataset("provider_dataset_unavailable"));
        expect(row?.label).toBe("Unavailable");
        expect(row?.reason).toBe("Provider dataset unavailable.");
    });
});

describe("datasetAttentionRows", () => {
    it("keeps only datasets with a marker", () => {
        expect(
            datasetAttentionRows([dataset(null), dataset("needs_attention:time_limit")]),
        ).toHaveLength(1);
    });
});
