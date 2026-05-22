import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/MarketingShell";

/**
 * Route group `(marketing)` exists ONLY so the home page (`/`) can share the
 * same chrome as `/marketing/*` without changing its canonical URL. Every
 * other marketing page lives under the real `/marketing/*` prefix — see
 * `src/app/marketing/`.
 *
 * Adding new routes to this group is an anti-pattern: it puts content under
 * the URL root with no namespace and was the original cause of the
 * orphaned-landing-pages issue (`/vp-engineering`, `/pricing`, etc. all sat
 * at the root with no discoverability).
 */
export const metadata: Metadata = {
  title: "Full Chaos Dev Health (Beta) — Where is your engineering effort going?",
  description:
    "Full Chaos Dev Health is an open-source analytics platform for team operating modes and developer health. See where effort is invested and what it costs your people.",
  openGraph: {
    title: "Full Chaos Dev Health (Beta) — Engineering Effort Analytics",
    description:
      "Understand where human effort is actually being invested, and the cost to people when certain work dominates.",
    url: "/",
    type: "website",
    siteName: "Full Chaos Dev Health",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Full Chaos Dev Health — Engineering Effort Analytics",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Full Chaos Dev Health (Beta) — Engineering Effort Analytics",
    description: "Open-source analytics for team operating modes and developer health.",
    images: ["/opengraph-image.png"],
  },
};

export default function MarketingHomeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <MarketingShell>{children}</MarketingShell>;
}
