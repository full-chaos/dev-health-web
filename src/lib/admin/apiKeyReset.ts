type Connection = { provider: string; baseUrl: string };

export function connectionChanged(prev: Connection, next: Connection): boolean {
    return prev.provider !== next.provider || prev.baseUrl.trim() !== next.baseUrl.trim();
}

export function keyAfterConnectionChange(
    prev: Connection,
    next: Connection,
    apiKey: string,
): string {
    return connectionChanged(prev, next) ? "" : apiKey;
}
