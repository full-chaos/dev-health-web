/** Pure formatting helpers shared by the BillingSettings subcomponents. */

export function pickString(
    record: Record<string, unknown> | null | undefined,
    keys: string[],
): string {
    if (!record) {
        return "-";
    }
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.length > 0) {
            return value;
        }
    }
    return "-";
}

export function formatDate(value: string | null): string {
    if (!value) {
        return "-";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return value;
    }
    return parsed.toLocaleDateString();
}

export function formatAmount(amountInCents: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        maximumFractionDigits: 0,
    }).format(amountInCents / 100);
}
