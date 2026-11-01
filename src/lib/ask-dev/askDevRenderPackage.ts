/**
 * The type of ask-dev's render entry (CHAOS-12393, CHAOS-12378 part C0). `import type` leaves
 * nothing at run time: nothing renders from the package yet. It makes web's `tsc` compile the
 * pinned package's source, so a pin bump that web cannot compile fails typecheck.
 */
import type * as AskDevRender from "@full-chaos/ask-dev/render";

export type AskDevRenderEntry = typeof AskDevRender;
