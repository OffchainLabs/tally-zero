import type { MetadataRoute } from "next";

import { canonicalUrl } from "@/lib/seo";
import { listStaticProposalIds } from "@/lib/static-proposal-data";
import { getCachedElectionCandidateStaticParams } from "@/lib/tally-data/server";

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
 * Proposal and candidate URLs come from the same helpers the two routes use
 * for generateStaticParams, so the sitemap lists exactly the pages the build
 * prerenders. The proposal page resolves the governor itself when `govId` is
 * absent, so the clean path is listed and is also what each proposal page
 * declares as its canonical. Candidate paths are lowercase, matching their
 * canonical and every internal link.
 *
 * No lastModified: neither source carries a generation time, and a guessed
 * value is worse than none because Google ignores sitemaps whose dates
 * prove unreliable.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sections = SECTION_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: canonicalUrl(path),
    changeFrequency,
    priority,
  }));

  const [proposalIds, candidates] = await Promise.all([
    listStaticProposalIds(),
    getCachedElectionCandidateStaticParams(),
  ]);

  const proposals = proposalIds.map((proposalId) => ({
    url: canonicalUrl(`/proposal/${proposalId}`),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const candidateProfiles = candidates.map(({ address }) => ({
    url: canonicalUrl(`/security-council/contender/${address}`),
    changeFrequency: "monthly" as const,
    priority: 0.4,
  }));

  return [...sections, ...proposals, ...candidateProfiles];
}
