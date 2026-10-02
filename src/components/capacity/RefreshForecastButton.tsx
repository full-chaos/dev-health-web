"use client";

import { Button } from "@/components/shared/Button";
import { capacityForecastInput } from "@/components/work/capacityInput";
import { CTA_LABELS } from "@/lib/design/cta";
import type { MetricFilter } from "@/lib/filters/types";
import { useCapacityForecast } from "@/lib/graphql/hooks";
import { useOrgId } from "@/lib/graphql/provider";

type RefreshForecastButtonProps = {
    filters: MetricFilter;
    orgId?: string;
};

/**
 * "Refresh Forecast" in the page header. It asks for the same forecast as the
 * view (same query, same variables), so urql runs one operation and the view
 * shows the new result. Behaviour is the old button's: refetch, and
 * "Computing..." with the button disabled while it runs.
 */
export function RefreshForecastButton({ filters, orgId: propOrgId }: RefreshForecastButtonProps) {
    const contextOrgId = useOrgId();
    const orgId = propOrgId || contextOrgId || "";
    const { loading, refetch } = useCapacityForecast({
        orgId,
        input: capacityForecastInput(filters),
    });

    return (
        <Button variant="secondary" onClick={() => refetch()} disabled={loading}>
            {loading ? "Computing..." : CTA_LABELS.refreshForecast}
        </Button>
    );
}
