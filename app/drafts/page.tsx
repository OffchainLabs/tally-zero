import { DraftsView } from "@/components/container/DraftsView";
import { ProposalsPageShell } from "@/components/container/ProposalsPageShell";

export const metadata = {
  title: "My Drafts | Arbitrum Governance",
  description:
    "Proposal drafts saved to your account, ready to share for review before going on chain.",
};

export default function DraftsPage() {
  return (
    <ProposalsPageShell>
      <DraftsView />
    </ProposalsPageShell>
  );
}
