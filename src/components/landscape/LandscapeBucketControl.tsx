"use client";

import { useRouter } from "next/navigation";

import { SegmentedControl } from "@/components/shared/SegmentedControl";

export type LandscapeBucket = "week" | "month";

/**
 * The Landscape bucket setting as the shared segmented control (concept L13): sentence-case "Week" and
 * "Month", the selected one in the selection wash. The bucket lives in the URL, so a change navigates
 * to the href the page built for it (the page keeps the filter and role in it).
 */
export function LandscapeBucketControl({
    value,
    hrefs,
    labels,
}: {
    value: LandscapeBucket;
    hrefs: Record<LandscapeBucket, string>;
    labels: Record<LandscapeBucket, string>;
}) {
    const router = useRouter();
    return (
        <SegmentedControl<LandscapeBucket>
            ariaLabel="Bucket"
            testId="landscape-bucket"
            // The page row around it sets the caps "BUCKET" label; the values read as words.
            className="normal-case tracking-normal"
            value={value}
            onChange={(next) => {
                if (next !== value) router.push(hrefs[next]);
            }}
            options={[
                { id: "week", label: labels.week },
                { id: "month", label: labels.month },
            ]}
        />
    );
}
