export function displayPacketTime(value: string): string {
    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
    }).format(new Date(value));
}

export function displayPacketNumber(value: number): string {
    return new Intl.NumberFormat("en-US").format(value);
}
