"use client";

/**
 * SecurityFilterBarWrapper
 *
 * Wraps the security-specific filter controls. Currently renders a placeholder
 * filter area; the full URL-based security filter UI is managed by SecurityAlertQueue
 * via its locked-pill and inline state. A dedicated SecurityFilterBar component
 * can be added here in a follow-up without changing the page component contract.
 */

interface SecurityFilterBarWrapperProps {
  /** Currently unused — filter is read from URL by child client components. */
  encodedFilter?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SecurityFilterBarWrapper({ encodedFilter }: SecurityFilterBarWrapperProps) {
  // Security filter controls (severity / source / state / date / search chips)
  // are planned for Wave 3. For now this is intentionally empty to preserve
  // the page component slot contract established in the spec.
  return null;
}
