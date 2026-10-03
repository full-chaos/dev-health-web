/**
 * The chance curve of a capacity forecast (CHAOS-8477), from served values only.
 *
 * `completionDistribution` serves the bins of the simulation (value, count) and the run total
 * (`runs`). The contract gives the rule: the share of the runs that ended at or below a bin is the
 * running sum of the counts divided by `runs`. The divisor is always the SERVED total; the web
 * adds up no total of its own, and with no served total there is no share.
 */

/** One served bin: an outcome and how many runs ended on it. */
export type ChanceBin = { value: number; count: number };

/** A served run total the web can divide by: a number above zero. Else null (not served). */
export const servedRuns = (runs: number | null | undefined): number | null =>
    typeof runs === "number" && runs > 0 ? runs : null;

/** Per served bin, ascending: the share of the runs that ended at or below it, in percent. */
export function chanceByValue(bins: ChanceBin[], runs: number): Array<[number, number]> {
    let ended = 0;
    return bins.map((bin): [number, number] => {
        ended += bin.count;
        return [bin.value, (ended * 100) / runs];
    });
}
