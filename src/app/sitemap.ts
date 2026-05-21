import type { MetadataRoute } from "next";

const BASE_URL = "https://www.fullchaos.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // Home
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    // Marketing hub
    {
      url: `${BASE_URL}/marketing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    // Buyer landings — one per role
    {
      url: `${BASE_URL}/marketing/vp-engineering`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/marketing/platform-devex`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/marketing/engineering-manager`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/marketing/cto-architecture`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Pricing
    {
      url: `${BASE_URL}/marketing/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Legal
    {
      url: `${BASE_URL}/marketing/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/marketing/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
