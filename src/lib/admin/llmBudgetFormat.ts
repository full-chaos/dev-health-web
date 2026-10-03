const MICRO_USD_PER_USD = 1_000_000;

/** A served micro-USD amount as dollars (two to six decimals). A missing amount reads "Unavailable". */
export function formatMicroUsd(value: number | null): string {
    if (value === null) return "Unavailable";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
    }).format(value / MICRO_USD_PER_USD);
}
