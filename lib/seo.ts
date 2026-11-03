/**
 * Search-engine metadata helpers shared by the route files.
 *
 * Every public page sets a canonical URL and a description; proposal pages
 * derive both from the proposal body. Keeping the rules here means the route
 * files stay declarative and the behaviour has unit tests.
 */

import type { Metadata } from "next";

import { extractProposalTitle, stripMarkdownAndHtml } from "@/lib/text-utils";
import type { ParsedProposal } from "@/types/proposal";
import { siteConfig } from "@config/site";

/** Google shows about this many characters of a description before cutting it. */
export const META_DESCRIPTION_MAX = 155;

/** Browser tabs and result pages cut titles around here. */
export const META_TITLE_MAX = 70;

/** Absolute canonical URL for a site path. */
export function canonicalUrl(path: string): string {
  const base = siteConfig.url.replace(/\/+$/, "");
  if (!path || path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Shared explicitly because Next.js replaces nested metadata objects. It has
 * no `url`: a page that does not set its own og:url should emit none, since
 * Open Graph consumers treat og:url as the page being shared.
 */
export const siteOpenGraph = {
  type: "website",
  locale: "en_US",
  title: siteConfig.name,
  description: siteConfig.description,
  siteName: siteConfig.name,
  images: [
    {
      url: siteConfig.ogImage,
      width: 2400,
      height: 1260,
      alt: siteConfig.ogImageAlt,
    },
  ],
} satisfies Metadata["openGraph"];

/**
 * Title, description, canonical, and matching Open Graph tags for a public
 * page. og:url is the canonical, so a shared link names this page rather
 * than the home page.
 */
export function pageMetadata({
  title,
  description,
  path,
  openGraphType = "website",
}: {
  title: string;
  description: string;
  path: string;
  openGraphType?: "website" | "article";
}): Metadata {
  const canonical = canonicalUrl(path);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      ...siteOpenGraph,
      type: openGraphType,
      title: `${title} | ${siteConfig.name}`,
      description,
      url: canonical,
    },
  };
}

/**
 * Plain text for a meta tag: markdown and HTML stripped, whitespace
 * collapsed, cut at a word boundary with an ellipsis when too long.
 */
export function summarizeForMeta(
  text: string,
  maxLength = META_DESCRIPTION_MAX
): string {
  const plain = stripMarkdownAndHtml(text).replace(/\s+/g, " ").trim();
  if (plain.length <= maxLength) return plain;

  const window = plain.slice(0, maxLength);
  const lastSpace = window.lastIndexOf(" ");
  // Fall back to a hard cut when the text is one long token (a URL, a hash).
  const cut = lastSpace > maxLength * 0.6 ? window.slice(0, lastSpace) : window;
  return `${cut.replace(/[\s,;:.]+$/, "")}…`;
}

/** The generic copy used when a proposal is not in the static cache. */
export const PROPOSAL_FALLBACK_METADATA = {
  title: "Proposal",
  description: "View an ArbitrumDAO proposal, its payload, and lifecycle.",
} as const;

/**
 * Title, description, canonical, and Open Graph tags for a proposal page.
 *
 * The canonical drops the `govId` and `tab` query the in-app links carry, so
 * the variants collapse into one indexed URL. The description is the body
 * after the title, so it does not repeat what the title already says.
 */
export function buildProposalMetadata(
  proposalId: string,
  proposal: ParsedProposal | null
): Metadata {
  const title = proposal
    ? summarizeForMeta(
        extractProposalTitle(proposal.description),
        META_TITLE_MAX
      )
    : "";
  const resolvedTitle = title || PROPOSAL_FALLBACK_METADATA.title;

  let description: string = PROPOSAL_FALLBACK_METADATA.description;
  if (proposal) {
    const body = stripMarkdownAndHtml(proposal.description)
      .replace(/\s+/g, " ")
      .trim();
    const plainTitle = stripMarkdownAndHtml(
      extractProposalTitle(proposal.description)
    ).trim();
    const rest =
      plainTitle && body.startsWith(plainTitle)
        ? body.slice(plainTitle.length).trim()
        : body;
    const governor = proposal.governorName
      ? `${proposal.governorName} proposal`
      : "ArbitrumDAO proposal";
    description = rest
      ? summarizeForMeta(rest)
      : `An ArbitrumDAO ${governor}. View the payload, votes, and lifecycle.`;
  }

  return pageMetadata({
    title: resolvedTitle,
    description,
    path: `/proposal/${proposalId}`,
    openGraphType: "article",
  });
}

/** schema.org WebSite record for the root layout. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    alternateName: "ArbitrumDAO Governance",
    url: canonicalUrl("/"),
    description: siteConfig.description,
    inLanguage: "en",
    publisher: {
      "@type": "Organization",
      name: "Offchain Labs",
      url: "https://offchainlabs.com",
    },
    about: {
      "@type": "Organization",
      name: "ArbitrumDAO",
      sameAs: [siteConfig.links.twitter],
    },
  };
}

/**
 * Serialize JSON-LD for a script tag. `<` is escaped so a value containing
 * "</script>" cannot close the tag.
 */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
