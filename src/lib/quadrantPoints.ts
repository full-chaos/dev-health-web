import type { QuadrantPoint, QuadrantResponse } from "@/lib/types";

/** A point with `no_data === true`, or a null / non-finite x or y, is never drawn (null is not 0). */
export function hasPlottableData(point: QuadrantPoint): boolean {
    if (point.no_data === true) return false;
    return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function plottablePoints(points: QuadrantPoint[] | undefined): QuadrantPoint[] {
    return (points ?? []).filter(hasPlottableData);
}

export function withPlottablePoints<T extends QuadrantResponse | null | undefined>(data: T): T {
    if (!data) return data;
    return { ...data, points: plottablePoints(data.points) };
}
