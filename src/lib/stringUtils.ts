/**
 * Shared string utility functions.
 */

/**
 * Convert a snake_case, kebab-case, or space-separated string to Title Case.
 *
 * @example
 * titleCase("my_key")      // "My Key"
 * titleCase("my-key")      // "My Key"
 * titleCase("my key")      // "My Key"
 */
export const titleCase = (value: string): string =>
    value
        .replace(/[_-]+/g, " ")
        .trim()
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
