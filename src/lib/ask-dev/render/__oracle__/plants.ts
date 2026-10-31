/**
 * Planted negatives (CHAOS-11941, E8 design §6.4): each is a copy of a REAL captured answer with one
 * defect planted, plus the outcome expected at each layer. The first group is malformed sourced
 * points, which ask-dev's verifier AND web's port must both withhold (AC-12). The second group is
 * admitted by the verifier and must be stopped by web's own guards (G1, G2, G5, G6) outside the port.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- plants edit raw captured JSON */
export type PlantLayerExpectation = {
    /** Whether the target shape is admitted by `renderShapesFor` (verify + unique id), on BOTH sides. */
    readonly verifier: "withheld" | "admitted" | "tz_dependent";
    /** `cohortRanking(served shape, cohort).state` when the plant is about ranking. */
    readonly ranking?: "kind_not_ranked" | "rows";
    /** The web guard that must withhold the shape when the verifier admits it. */
    readonly guard?: "G1" | "G2" | "G5" | "G6";
};

export type Plant = {
    readonly name: string;
    readonly result: any;
    /** Index in `render_shapes` of the shape the defect is planted in. */
    readonly target: number;
    readonly expect: PlantLayerExpectation;
};

const clone = <T>(value: T): T => structuredClone(value);

/** The next representable double above `x` (x > 0): one unit in the last place. */
export function nextUp(x: number): number {
    const bits = new Float64Array([x]);
    const word = new BigInt64Array(bits.buffer);
    word[0] = word[0]! + BigInt(x >= 0 ? 1 : -1);
    return bits[0]!;
}

function shapeIndex(result: any, rule: string): number {
    const index = (result.render_shapes ?? []).findIndex((s: any) => s.selected_by === rule);
    if (index < 0) throw new Error(`base capture has no ${rule} shape`);
    return index;
}

/**
 * `cohortBase`: a real answer with both cohort shapes and one scored, driven member (C1/C2).
 * `trendBase`: a real answer with a `dated_fact_trend` shape (K1).
 */
export function plants(cohortBase: any, trendBase: any): Plant[] {
    const bars = shapeIndex(cohortBase, "cohort_attention_score");
    const stack = shapeIndex(cohortBase, "cohort_driver_contribution");
    const trend = shapeIndex(trendBase, "dated_fact_trend");
    const out: Plant[] = [];
    const cohortPlant = (
        name: string,
        target: number,
        expect: PlantLayerExpectation,
        edit: (r: any) => void,
    ) => {
        const result = clone(cohortBase);
        edit(result);
        out.push({ name, result, target, expect });
    };
    const trendPlant = (name: string, expect: PlantLayerExpectation, edit: (r: any) => void) => {
        const result = clone(trendBase);
        edit(result);
        out.push({ name, result, target: trend, expect });
    };
    const withheld = { verifier: "withheld" } as const;
    const firstBar = (r: any) => r.render_shapes[bars].series[0].points[0];
    const scoredMember = (r: any) => {
        const id = firstBar(r).source.subject_canonical_id;
        return r.cohort.members.find((m: any) => m.subject.canonical_id === id);
    };

    // Malformed sourced points: withheld by both (AC-12).
    cohortPlant("value_plus_one_ulp", bars, withheld, (r) => {
        firstBar(r).value = nextUp(firstBar(r).value);
    });
    cohortPlant("value_of_another_source", bars, withheld, (r) => {
        const other = r.render_shapes[stack].series
            .flatMap((s: any) => s.points)
            .find((p: any) => p.value !== firstBar(r).value);
        firstBar(r).value = other.value;
    });
    cohortPlant("source_to_absent_member", bars, withheld, (r) => {
        firstBar(r).source.subject_canonical_id = "team:planted-absent";
    });
    cohortPlant("duplicate_shape_id", bars, withheld, (r) => {
        r.render_shapes[stack].shape_id = r.render_shapes[bars].shape_id;
    });
    cohortPlant("wrong_address_field", bars, withheld, (r) => {
        firstBar(r).source.signal = "investment_mix";
    });
    cohortPlant("value_at_2_pow_53", bars, withheld, (r) => {
        firstBar(r).value = 2 ** 53;
        scoredMember(r).score = 2 ** 53;
    });
    cohortPlant("presentation_absent", bars, withheld, (r) => {
        delete r.render_shapes[bars].presentation;
    });
    trendPlant("descending_time_labels", withheld, (r) => {
        r.render_shapes[trend].series[0].points.reverse();
    });
    trendPlant("not_a_calendar_date", withheld, (r) => {
        r.render_shapes[trend].series[0].points[0].label = "2026-02-30";
    });
    trendPlant("time_axis_with_bars", withheld, (r) => {
        r.render_shapes[trend].presentation = "bars";
    });
    trendPlant("duplicate_claim_id", withheld, (r) => {
        const claimId = r.render_shapes[trend].series[0].points[0].source.claim_id;
        const fact = r.claimed_facts.find((f: any) => f.claim_id === claimId);
        r.claimed_facts.push(clone(fact));
    });

    // Admitted by the verifier, stopped by a web guard (or by the ranking port).
    cohortPlant(
        "person_cohort_kind",
        bars,
        { verifier: "admitted", ranking: "kind_not_ranked", guard: "G1" },
        (r) => {
            r.cohort.kind = "person";
        },
    );
    cohortPlant(
        "person_member_kind",
        bars,
        { verifier: "admitted", ranking: "kind_not_ranked", guard: "G1" },
        (r) => {
            r.cohort.members[r.cohort.members.length - 1].subject.kind = "person";
        },
    );
    cohortPlant(
        "unknown_cohort_kind",
        bars,
        { verifier: "admitted", ranking: "kind_not_ranked", guard: "G1" },
        (r) => {
            r.cohort.kind = "planted_unknown_kind";
        },
    );
    cohortPlant(
        "attention_point_for_driverless_member",
        bars,
        { verifier: "admitted", ranking: "rows", guard: "G2" },
        (r) => {
            scoredMember(r).drivers = [];
            r.render_shapes.splice(stack, 1);
        },
    );
    cohortPlant(
        "attention_point_for_unranked_member",
        bars,
        { verifier: "admitted", guard: "G2" },
        (r) => {
            delete scoredMember(r).ranking_computed;
        },
    );
    cohortPlant("negative_value_in_stack", stack, { verifier: "admitted", guard: "G6" }, (r) => {
        const point = r.render_shapes[stack].series[0].points[0];
        const member = r.cohort.members.find(
            (m: any) => m.subject.canonical_id === point.source.subject_canonical_id,
        );
        const driver = member.drivers.find((d: any) => d.signal === point.source.signal);
        driver.weight_contributed = -1;
        point.value = -1;
    });
    // Zone-less and zoned labels whose local order (Asia/Tokyo) differs from their UTC order: the
    // verifier's verdict follows the process time zone (ask-dev parses zone-less as local, F12), so
    // only agreement is asserted; web's G5 re-checks under UTC.
    trendPlant("zone_less_vs_zoned_labels", { verifier: "tz_dependent", guard: "G5" }, (r) => {
        const series = r.render_shapes[trend].series[0];
        series.points = series.points.slice(0, 2);
        series.points[0].label = "2026-08-01T01:00:00";
        series.points[1].label = "2026-07-31T20:00:00Z";
    });
    return out;
}
