import type { MetricFilter } from "@/lib/filters/types";
import { GlobalContextBar } from "./GlobalContextBar";

type ContextStripProps = {
    filters: MetricFilter;
    origin?: string | null;
};

export function ContextStrip({ filters, origin }: ContextStripProps) {
    return <GlobalContextBar filters={filters} origin={origin} />;
}
