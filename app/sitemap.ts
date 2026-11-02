import { extractProposals, type BundledCache } from "@gzeoneth/gov-tracker";
import type { MetadataRoute } from "next";

import { canonicalUrl } from "@/lib/seo";

/** Public pages that do not depend on a wallet. */
const SECTION_PATHS: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/proposals", changeFrequency: "daily", priority: 0.9 },
  { path: "/delegates", changeFrequency: "weekly", priority: 0.8 },
  { path: "/security-council", changeFrequency: "weekly", priority: 0.8 },
  {
    path: "/security-council/actions",
    changeFrequency: "weekly",
    priority: 0.6,
  },
  { path: "/tos", changeFrequency: "yearly", priority: 0.2 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
];

/**
 * Proposal URLs come from the gov-tracker bundled cache, the same source
 * the proposal page uses for generateStaticParams, so the sitemap lists
 * exactly the proposal pages the build renders. The page resolves the
 * governor itself when `govId` is absent, so the clean path is listed and
 * is also what each proposal page declares as its canonical.
 *
 * No lastModified: the cache carries no generation time, and a guessed
 * value is worse than none because Google ignores sitemaps whose dates
 * prove unreliable.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sections = SECTION_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: canonicalUrl(path),
    changeFrequency,
    priority,
  }));

  const imported = await import("@gzeoneth/gov-tracker/bundled-cache.json");
  const cache = imported.default as BundledCache;
  const proposalIds = new Set<string>();
  for (const proposal of extractProposals(cache)) {
    if (proposal.proposalId) proposalIds.add(proposal.proposalId);
  }

  const proposals = Array.from(proposalIds).map((proposalId) => ({
    url: canonicalUrl(`/proposal/${proposalId}`),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...sections, ...proposals];
}
