/**
 * Opacities that charts and pills apply to a theme token to draw a tint.
 * Each is applied exactly once, so the unit tests can compute the rendered color.
 */

/**
 * Opacities of a quadrant zone's radial gradient: the zone's token hue at `peak` in the
 * centre, `mid` at 60% of the radius, `edge` at the rim. These are production's values;
 * only the hue comes from the theme. Zones overlap on purpose, so the overlap composites.
 */
export const ZONE_GRADIENT_ALPHA = { peak: 0.2, mid: 0.12, edge: 0 } as const;

/** Fill opacity of a status pill: status token over the card surface (`bg-(--x)/12`). */
export const STATUS_PILL_ALPHA = 0.12;
