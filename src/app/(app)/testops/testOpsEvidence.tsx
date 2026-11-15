import type { EvidenceContentSubject } from "@/components/evidence/EvidenceDrawerProvider";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { formatMetricValue } from "@/lib/formatters";
import {
    TEAM_OWNS_NO_REPOSITORY,
    filterEmptyReasonText,
    teamOwnsNoRepository,
} from "@/lib/metrics/filterEmptyReason";
import type { TimeseriesResult } from "@/lib/graphql/schemas/analytics";
import {
    getDelta,
    getLatestValue,
    getSparkline,
    needsOneTeamPick,
} from "@/lib/testops/aggregateSeries";
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
    /** `valueText` is a state ("Pick one team"), not a value: no number, no trend. */
    valueIsMessage?: boolean;
};

/** The tile state of a selected team that owns no repository (the server's reason; never derived here). */
export const NO_OWNED_REPOSITORIES = filterEmptyReasonText(TEAM_OWNS_NO_REPOSITORY) ?? "";

/** A tile that is the state, not a value: no number, no trend, no change. */
export const noOwnedRepositoriesTile = <T extends object>(tile: T) => ({
    ...tile,
    note: undefined,
    value: undefined,
    valueText: NO_OWNED_REPOSITORIES,
    valueIsMessage: true,
    delta: undefined,
    noDelta: true,
    spark: undefined,
});

/** The state of a measure with no ORG series when two or more team series are served. */
export const PICK_ONE_TEAM = "Pick one team";

/**
 * Resolve the tiles of a TestOps tab from the served time series. The readers are the ones the
 * pages always used (`getLatestValue`, `getSparkline`, `getDelta`), on one scope per measure
 * (`teamIds`: the selected teams; see `seriesForScope`); a measure the registry does not know is
 * left out. `emptyReason` is the server's reason for the whole answer: a team that owns no
 * repository makes every tile the state "No owned repositories".
 */
export function resolveTestOpsTiles(
    measures: ReadonlyArray<{ id: string; ts: TimeseriesResult[] }>,
    teamIds?: readonly string[],
    emptyReason?: string | null,
): TestOpsTile[] {
    return measures.flatMap(({ id, ts }) => {
        const def = TESTOPS_MEASURES[id];
        if (!def) return [];
        const tile = {
            id,
            label: def.label,
            description: def.description,
            unit: def.unit === "percentage" ? "%" : def.unit === "duration" ? "m" : "",
            inverseGood: def.goodDirection === "down",
        };
        if (teamOwnsNoRepository(emptyReason)) {
            return [noOwnedRepositoriesTile({ ...tile, note: undefined })];
        }
        if (needsOneTeamPick(ts, id, teamIds)) {
            return [
                {
                    ...tile,
                    note: "Served per team: no organization value for several teams",
                    value: undefined,
                    valueText: PICK_ONE_TEAM,
                    valueIsMessage: true,
                    delta: undefined,
                    noDelta: true,
                    spark: undefined,
                },
            ];
        }
        return [
            {
                ...tile,
                note: def.note,
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
