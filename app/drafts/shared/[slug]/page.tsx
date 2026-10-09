import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { SharedDraftView } from "@/components/drafts/SharedDraftView";

interface SharedDraftPageProps {
  params: Promise<{ slug: string }>;
}

export const metadata = {
  title: "Shared Draft | Arbitrum Governance",
  description: "A proposal draft shared for review before going on chain.",
};

export default async function SharedDraftPage({
  params,
}: SharedDraftPageProps) {
  const { slug } = await params;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/proposals"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Proposals
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Shared Draft</h1>
        <p className="mt-2 text-muted-foreground">
          A proposal draft shared for review. It has not been submitted on chain
          unless marked below.
        </p>
      </div>

      <SharedDraftView slug={slug} />
    </div>
  );
}
