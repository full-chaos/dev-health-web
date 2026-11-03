import "server-only";

// Repository key grammar of dev-health-acr internal/reposlug (ValidSlug): 2-20 segments in at
// most 255 bytes, every segment but the last a group name, the last a repository name.
export const MAX_SLUG_SEGMENTS = 20;
export const MAX_SLUG_BYTES = 255;

const GROUP = /^[a-z0-9](?:[a-z0-9._-]{0,98}[a-z0-9])?$/;
// A repository name may lead with '.' (full-chaos/.github); '.' and '..' fail the last-character rule.
const NAME = /^(?:[a-z0-9]|[a-z0-9.][a-z0-9._-]{0,98}[a-z0-9])$/;

export function isRepositoryKey(key: string): boolean {
    if (key.length > MAX_SLUG_BYTES) return false;
    const parts = key.split("/");
    if (parts.length < 2 || parts.length > MAX_SLUG_SEGMENTS) return false;
    const last = parts[parts.length - 1];
    return parts.slice(0, -1).every((p) => GROUP.test(p)) && NAME.test(last);
}

export const isRepositoryKeyOrAll = (key: string): boolean => key === "*" || isRepositoryKey(key);
