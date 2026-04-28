/**
 * Site configuration for TallyZero
 * Contains metadata, URLs, and social links
 */

import type { SiteConfig } from "@types";

/** Base URL for the site */
const url = "https://alt.gov.arbitrum.foundation";

/** Site-wide configuration for metadata and links */
export const siteConfig = {
  name: "Arbitrum Governance",
  description: "Vote on ArbitrumDAO proposals",
  url,
  ogImage: `${url}/opengraph-image.jpg`,
  links: {
    twitter: "https://twitter.com/arbitrum",
    github: "https://github.com/offchainlabs/tally-zero",
  },
  manifest: `${url}/site.webmanifest`,
} as const satisfies SiteConfig;
