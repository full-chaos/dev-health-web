"use client";

import { describeSizing } from "./AllocationCoverage";
import { readSizingCoverage } from "@/lib/investment/coverage";
import type { OperatingReviewSizing } from "@/lib/graphql/types";

/**
 * The line under the Operating Review investment tiles when the section is read in issue size (CHAOS-9873,
 * D6027): how much of the work is sized, in the words of every other issue-size surface. A section read in
 * work units (or one that carries no sizing) draws nothing, and a coverage the API did not produce reads
 * "Not measured", never a full or a fine reading.
 */
export function OperatingReviewSizingNote({ sizing }: { sizing?: OperatingReviewSizing | null }) {
    if (!sizing || sizing.measure !== "ISSUE_SIZE") {
        return null;
    }
    const reading = readSizingCoverage(sizing.sizingCoverage, sizing.unsizedUnitCount);
    const { value, note } = describeSizing(reading);
    return (
        <p className="mt-3 text-xs text-(--ink-muted)" data-testid="operating-review-sizing-note">
            <span data-testid="operating-review-sizing-coverage">
                Issue size coverage: {value}.
            </span>{" "}
            <span data-testid="operating-review-sizing-text">{note}</span>
        </p>
    );
}
