/**
 * Extract a human-readable error message from backend API error responses.
 *
 * The backend returns `detail` in the normalized shape:
 * `{ message: string, errors?: string[] }` — all auth errors
 *
 * Legacy shapes are also supported for backward compatibility:
 * - String: `"Email already registered"`
 * - Object with `violations`: `{ violations: ["..."] }`
 * - Pydantic validation array: `[{ loc: [...], msg: "...", type: "..." }]`
 */
export function extractErrorMessage(detail: unknown, fallback = "Something went wrong"): string {
  if (detail == null) return fallback;

  // Shape 1: plain string
  if (typeof detail === "string") {
    return detail;
  }

  if (typeof detail === "object") {
    // Shape 4: Pydantic validation errors — array of { loc, msg, type }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item !== null && "msg" in item) {
            return String((item as { msg: unknown }).msg);
          }
          return null;
        })
        .filter(Boolean) as string[];

      return messages.length > 0 ? messages.join(". ") : fallback;
    }

    const obj = detail as Record<string, unknown>;

    // Normalized shape: { message: string, errors?: string[] }
    if ("message" in obj && typeof obj.message === "string") {
      if ("errors" in obj && Array.isArray(obj.errors)) {
        const errors = obj.errors.filter((v): v is string => typeof v === "string");
        if (errors.length > 0) return errors.join(". ");
      }
      return obj.message;
    }

    // Legacy: password policy violations — { violations: string[] }
    if ("violations" in obj && Array.isArray(obj.violations)) {
      const violations = obj.violations.filter((v): v is string => typeof v === "string");
      return violations.length > 0 ? violations.join(". ") : fallback;
    }
  }

  return fallback;
}
