/**
 * CHAOS-9110: the four served inputs every reader of a delta percent must tell apart. The served
 * flags decide what a null (or a placeholder 0) percent means; a reader never reads it alone.
 */
export type DeltaInput = {
    name: string;
    value: number;
    delta_pct: number | null;
    has_data: boolean;
    has_prior_data: boolean;
    /** What a reader draws: the shared rule's text for this input. */
    state: "from-zero" | "no-data" | "no-prior";
};

export const DELTA_INPUTS: DeltaInput[] = [
    {
        name: "a: null + both flags true",
        value: 5,
        delta_pct: null,
        has_data: true,
        has_prior_data: true,
        state: "from-zero",
    },
    {
        name: "b: null + has_data false",
        value: 0,
        delta_pct: null,
        has_data: false,
        has_prior_data: true,
        state: "no-data",
    },
    {
        name: "c: null + has_prior_data false",
        value: 5,
        delta_pct: null,
        has_data: true,
        has_prior_data: false,
        state: "no-prior",
    },
    {
        name: "d1: 0 + has_data false (today's wire)",
        value: 0,
        delta_pct: 0,
        has_data: false,
        has_prior_data: true,
        state: "no-data",
    },
    {
        name: "d2: 0 + has_prior_data false (today's wire)",
        value: 5,
        delta_pct: 0,
        has_data: true,
        has_prior_data: false,
        state: "no-prior",
    },
];

export const NO_DATA_TEXT = "No data for this window";
export const NO_PRIOR_TEXT = "No prior period";
export const FROM_ZERO_TEXT = /\+5 LOC from 0/i;
