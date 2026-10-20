import MyDraftsList from "@/components/container/MyDraftsList";
import { ProposalsPageShell } from "@/components/container/ProposalsPageShell";
import { ProposalsTabs } from "@/components/container/ProposalsTabs";

export const metadata = {
  title: "My Drafts | Arbitrum Governance",
  description:
    "Proposal drafts saved to your account, ready to share for review before going on chain.",
};

export default function DraftsPage() {
  return (
    <ProposalsPageShell>
      <ProposalsTabs active="drafts">
        <MyDraftsList />
      </ProposalsTabs>
    </ProposalsPageShell>
  );
}
