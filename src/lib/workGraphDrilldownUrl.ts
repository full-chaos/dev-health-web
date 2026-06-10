import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";

type InvestmentWorkGraphUrlOptions = {
    filters: MetricFilter;
    role?: string;
    themeKey: string;
    subcategoryKey?: string | null;
};

export const buildInvestmentWorkGraphUrl = ({
    filters,
    role,
    themeKey,
    subcategoryKey,
}: InvestmentWorkGraphUrlOptions) => {
    const graphParams = new URLSearchParams({ graph_theme: themeKey });
    if (subcategoryKey) {
        graphParams.set("graph_subcategory", subcategoryKey);
    }
    return `${withFilterParam("/diagnose/work-graph", filters, role)}&${graphParams.toString()}`;
};
