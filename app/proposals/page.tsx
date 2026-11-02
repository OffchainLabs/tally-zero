import { ProposalsPageShell } from "@/components/container/ProposalsPageShell";
import { ProposalsView } from "@/components/container/ProposalsView";
import { canonicalUrl } from "@/lib/seo";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Proposals",
  description:
    "Every ArbitrumDAO proposal across the Core and Treasury governors, with live votes, quorum, and lifecycle status.",
  alternates: { canonical: canonicalUrl("/proposals") },
};

export default function IndexPage() {
  return (
    <ProposalsPageShell>
      <ProposalsView />
    </ProposalsPageShell>
  );
}
