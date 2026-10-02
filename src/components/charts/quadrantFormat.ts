import { formatNumber } from "@/lib/formatters";

/**
 * A quadrant axis value with its unit, as the chart tooltip shows it. The evidence drawer for a
 * point uses the same function, so the drawer and the chart show the same raw value.
 */
export const formatQuadrantValue = (value: number, unit: string) => {
    if (!Number.isFinite(value)) {
        return "--";
    }
    if (unit === "%") {
        return `${formatNumber(value, { maximumFractionDigits: 1 })}%`;
    }
    if (unit === "days") {
        return `${formatNumber(value, { maximumFractionDigits: 1 })}d`;
    }
    if (unit === "hours") {
        return `${formatNumber(value, { maximumFractionDigits: 1 })}h`;
    }
    return `${formatNumber(value, { maximumFractionDigits: 1 })} ${unit}`.trim();
};
