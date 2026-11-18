import { DraftsView } from "@/components/container/DraftsView";
import { ProposalsPageShell } from "@/components/container/ProposalsPageShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Drafts",
  description:
    "Proposal drafts saved to your account, ready to share for review before going on chain.",
  // Account-bound; nothing to index.
  robots: { index: false, follow: true },
};

export default function DraftsPage() {
  return (
    <ProposalsPageShell>
      <DraftsView />
    </ProposalsPageShell>
  );
}
