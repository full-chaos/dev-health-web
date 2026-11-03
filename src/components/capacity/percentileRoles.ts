/**
 * The role word of each percentile: one source for the tiles, the evidence facts and the marker
 * labels of the Completion range card (CHAOS-8614). Its own module, so a surface that draws the
 * chart without the tiles (the Ask Dev forecast slot, CHAOS-4613) loads no tile component.
 */
export const PERCENTILE_ROLE = {
    P50: "optimistic",
    P85: "target",
    P95: "conservative",
} as const;
export type Percentile = keyof typeof PERCENTILE_ROLE;
