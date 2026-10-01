/**
 * Opacities that charts and pills apply to a theme token to draw a tint.
 * Each is applied exactly once, so the unit tests can compute the rendered color.
 */

/** Fill opacity of a quadrant zone: token color over the chart surface. */
export const ZONE_FILL_ALPHA = 0.16;

/** Fill opacity of a status pill: status token over the card surface (`bg-(--x)/12`). */
export const STATUS_PILL_ALPHA = 0.12;
