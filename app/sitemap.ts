import type { MetadataRoute } from "next";

import proposalsIndex from "@/data/proposals-index.json";
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
 * Proposal URLs come from the committed proposals index, so the sitemap is
 * static and lists every proposal the build knows about. The page resolves
 * the governor itself when `govId` is absent, so the clean path is listed and
 * is also what each proposal page declares as its canonical.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const generatedAt = new Date(proposalsIndex.generatedAt);
  const lastModified = Number.isNaN(generatedAt.getTime())
    ? new Date()
    : generatedAt;

  const sections = SECTION_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: canonicalUrl(path),
    lastModified,
    changeFrequency,
    priority,
  }));

  const proposalIds = new Set<string>();
  for (const proposal of proposalsIndex.proposals) {
    if (proposal.proposalId) proposalIds.add(proposal.proposalId);
  }

  const proposals = Array.from(proposalIds).map((proposalId) => ({
    url: canonicalUrl(`/proposal/${proposalId}`),
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...sections, ...proposals];
}
