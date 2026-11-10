export function keyAfterConnectionChange(
    prev: { provider: string; baseUrl: string },
    next: { provider: string; baseUrl: string },
    apiKey: string,
): string {
    return prev.provider !== next.provider || prev.baseUrl.trim() !== next.baseUrl.trim()
        ? ""
        : apiKey;
}
