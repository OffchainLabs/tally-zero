import type { MetadataRoute } from "next";

import { canonicalUrl } from "@/lib/seo";

/**
 * Only the API is kept out of the crawl. Account-bound pages (drafts, new
 * proposal, delegate registration, my delegation) carry a noindex tag
 * instead: a disallow here would stop Google from ever reading that tag, so
 * any copy it already has would stay in the index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: canonicalUrl("/sitemap.xml"),
  };
}
