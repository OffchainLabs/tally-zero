import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import ProposalPageClient from "./ProposalPageClient";

interface ProposalPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Pre-generate pages for every proposal referenced by the bundled
 * gov-tracker cache so shareable URLs work in static export.
 *
 * Proposals not yet in the bundled cache can still be reached by clicking
 * through the /proposals modal, which updates the hash-based deep link.
 */
export function generateStaticParams(): { id: string }[] {
  const ids = new Set<string>();
  try {
    const bundled =
      require("@gzeoneth/gov-tracker/bundled-cache.json") as Record<
        string,
        unknown
      >;
    for (const entry of Object.values(bundled)) {
      if (!entry || typeof entry !== "object") continue;
      const input = (entry as { input?: { proposalId?: unknown } }).input;
      if (input && typeof input.proposalId === "string") {
        ids.add(input.proposalId);
      }
    }
  } catch {
    // Bundled cache not available at build time — that's OK.
  }
  return Array.from(ids).map((id) => ({ id }));
}

export const metadata = {
  title: "Proposal | Arbitrum Governance",
  description: "View an Arbitrum DAO proposal, its payload, and lifecycle.",
};

export default async function ProposalPage({ params }: ProposalPageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6 pb-8 pt-6 md:pb-12 md:pt-10 lg:py-16">
      <div className="container flex flex-col gap-6">
        <div>
          <Link
            href="/proposals"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Proposals
          </Link>
        </div>

        <ProposalPageClient proposalId={id} />
      </div>
    </div>
  );
}
