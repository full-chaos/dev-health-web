import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dev Health (Beta) — Where is your engineering effort going?",
  description:
    "Dev Health is an open-source analytics platform for team operating modes and developer health. See where effort is invested and what it costs your people.",
  openGraph: {
    title: "Dev Health (Beta) — Engineering Effort Analytics",
    description:
      "Understand where human effort is actually being invested, and the cost to people when certain work dominates.",
    type: "website",
    siteName: "Dev Health",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dev Health (Beta) — Engineering Effort Analytics",
    description:
      "Open-source analytics for team operating modes and developer health.",
  },
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
