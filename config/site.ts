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
  /** Home page title; written in full so the "| Arbitrum Governance" template is not appended to itself. */
  homeTitle: "Arbitrum Governance: Vote on ArbitrumDAO Proposals",
  /** 156 characters: inside Google's snippet limit and names the three things the site is for. */
  description:
    "Vote on ArbitrumDAO governance proposals, delegate your ARB voting power, and follow Security Council elections. The on-chain voting portal for Arbitrum DAO.",
  url,
  ogImage: `${url}/opengraph-image.jpg`,
  ogImageAlt: "Arbitrum Governance: vote on ArbitrumDAO proposals",
  /** X handles for the Twitter card: the site's account and its author. */
  twitterSite: "@arbitrum",
  twitterCreator: "@Offchain",
  links: {
    twitter: "https://twitter.com/arbitrum",
    github: "https://github.com/offchainlabs/tally-zero",
  },
  manifest: `${url}/site.webmanifest`,
} as const satisfies SiteConfig;
