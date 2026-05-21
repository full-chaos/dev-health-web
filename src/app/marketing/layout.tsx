import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export const metadata: Metadata = {
  title: "Solutions — Full Chaos Dev Health",
  description:
    "Buyer-aligned solutions for engineering leaders, platform teams, managers, and architecture. Open-source, inspectable, no surveillance.",
  openGraph: {
    title: "Full Chaos Dev Health — Solutions for every engineering role",
    description:
      "Buyer-aligned narratives mapped to the product surfaces that matter to each role.",
    type: "website",
    siteName: "Full Chaos Dev Health",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Full Chaos Dev Health — Solutions",
      },
    ],
  },
};

export default function MarketingSubrouteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <MarketingShell>{children}</MarketingShell>;
}
