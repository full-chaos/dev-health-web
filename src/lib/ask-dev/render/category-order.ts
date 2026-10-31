import type { Cohort, RenderShape } from "@/lib/ask-dev/render/contracts";
import { utcInstant } from "@/lib/ask-dev/render/guards";

/**
 * Category and time order for a verified shape (CHAOS-11941, E8 design §7.1). Never alphabetical.
 * Cohort-rule shapes follow the served `attention_rank` of the member each point cites (ties by
 * canonical id, ACR's own order); other category shapes use the first-seen union of point labels;
 * time shapes use the UTC instant (G5's parse). Displayed labels stay the served strings.
 */
/**
 * The members a cohort-rule shape cites, in `cohortCategoryOrder`'s order, each with the served label
 * it was cited under first (CHAOS-11943). A position is a member, not a label: two members may share
 * a label, and each keeps its own points.
 */
export function cohortCategoryMembers(
    shape: RenderShape,
    cohort: Cohort | undefined,
): { readonly id: string; readonly label: string }[] {
    const rankOf = new Map<string, { rank: number; id: string }>();
    for (const member of cohort?.members ?? []) {
        rankOf.set(member.subject.canonical_id, {
            rank:
                typeof member.attention_rank === "number"
                    ? member.attention_rank
                    : Number.POSITIVE_INFINITY,
            id: member.subject.canonical_id,
        });
    }
    const labelOf = new Map<string, string>();
    for (const series of shape.series) {
        for (const point of series.points) {
            const id = point.source.subject_canonical_id;
            if (id !== undefined && !labelOf.has(id)) labelOf.set(id, point.label);
        }
    }
    return [...labelOf.keys()]
        .sort((a, b) => {
            const ra = rankOf.get(a) ?? { rank: Number.POSITIVE_INFINITY, id: a };
            const rb = rankOf.get(b) ?? { rank: Number.POSITIVE_INFINITY, id: b };
            return ra.rank - rb.rank || (ra.id < rb.id ? -1 : ra.id > rb.id ? 1 : 0);
        })
        .map((id) => ({ id, label: labelOf.get(id)! }));
}

export function cohortCategoryOrder(shape: RenderShape, cohort: Cohort | undefined): string[] {
    return cohortCategoryMembers(shape, cohort).map((member) => member.label);
}

/** First-seen union of point labels across series. */
export function unionCategoryOrder(shape: RenderShape): string[] {
    const order: string[] = [];
    const seen = new Set<string>();
    for (const series of shape.series) {
        for (const point of series.points) {
            if (!seen.has(point.label)) {
                seen.add(point.label);
                order.push(point.label);
            }
        }
    }
    return order;
}

/** Time positions in UTC instant order, each with the served label it was drawn from first. */
export function utcTimeOrder(
    shape: RenderShape,
): { readonly at: number; readonly label: string }[] {
    const byInstant = new Map<number, string>();
    for (const series of shape.series) {
        for (const point of series.points) {
            const at = utcInstant(point.label);
            if (at !== null && !byInstant.has(at)) byInstant.set(at, point.label);
        }
    }
    return [...byInstant.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([at, label]) => ({ at, label }));
}
