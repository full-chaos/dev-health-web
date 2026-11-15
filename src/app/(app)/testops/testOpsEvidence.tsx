import type { EvidenceContentSubject } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { formatMetricValue } from "@/lib/formatters";
import type { TimeseriesResult } from "@/lib/graphql/schemas/analytics";
import { getDelta, getLatestValue, getSparkline } from "@/lib/testops/aggregateSeries";
import { TESTOPS_MEASURES } from "@/lib/testops/constants";

/** One metric tile of a TestOps tab: the served series of one measure, as the tile shows it. */
export type TestOpsTile = {
    id: string;
    label: string;
    description: string;
    /** Short tile note (approved copy); `undefined` where the approved tile has none. */
    note: string | undefined;
    unit: string;
    inverseGood: boolean;
    /** Latest served value; `undefined` when the API served none (shown as "--", never 0). */
    value: number | undefined;
    delta: number | undefined;
    spark: ReturnType<typeof getSparkline>;
    /** The tile's own value text (a rate cut down, never rounded up); the evidence shows the same text. */
    valueText?: string;
    /** No change value is read for this tile: the card draws no delta and no "No prior period". */
    noDelta?: boolean;
};

/**
 * Resolve the tiles of a TestOps tab from the served time series. The readers are the ones the
 * pages always used (`getLatestValue`, `getSparkline`, `getDelta`), on one scope per measure
 * (`teamIds`: the selected teams; see `seriesForScope`); a measure the registry does not know is
 * left out.
 */
export function resolveTestOpsTiles(
    measures: ReadonlyArray<{ id: string; ts: TimeseriesResult[] }>,
    teamIds?: readonly string[],
): TestOpsTile[] {
    return measures.flatMap(({ id, ts }) => {
        const def = TESTOPS_MEASURES[id];
        if (!def) return [];
        return [
            {
                id,
                label: def.label,
                description: def.description,
                note: def.note,
                unit: def.unit === "percentage" ? "%" : def.unit === "duration" ? "m" : "",
                inverseGood: def.goodDirection === "down",
                value: getLatestValue(ts, id, teamIds),
                delta: getDelta(ts, id, teamIds),
                spark: getSparkline(ts, id, teamIds),
            },
        ];
    });
}

/**
 * The page subject of the header's "View evidence" action on a TestOps tab: the tiles' served
 * values as fact rows (the same value and format as the tile), then what each value measures
 * (the full definitions, which the tiles no longer carry). A measure with no served value reads
 * "Not reported"; no number is made here.
 */
export function testOpsEvidenceSubject(
    title: string,
    tiles: TestOpsTile[],
): EvidenceContentSubject {
    return {
        title,
        content: (
            <div className="space-y-5">
                <EvidenceFactList
                    aria-label={`${title} served values`}
                    testId="testops-evidence-facts"
                >
                    {tiles.map((tile) => (
                        <EvidenceFact
                            key={tile.id}
                            label={tile.label}
                            value={
                                tile.valueText ??
                                (tile.value === undefined
                                    ? undefined
                                    : formatMetricValue(tile.value, tile.unit))
                            }
                        />
                    ))}
                </EvidenceFactList>
                <div>
                    <p className="text-label-caps uppercase text-(--ink-muted)">
                        What each value measures
                    </p>
                    <EvidenceFactList
                        aria-label={`${title} definitions`}
                        testId="testops-evidence-definitions"
                    >
                        {tiles.map((tile) => (
                            <EvidenceFact
                                key={tile.id}
                                label={tile.label}
                                value={tile.description}
                                stacked
                            />
                        ))}
                    </EvidenceFactList>
                </div>
            </div>
        ),
    };
}
