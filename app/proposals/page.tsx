import { ProposalsPageShell } from "@/components/container/ProposalsPageShell";
import { ProposalsView } from "@/components/container/ProposalsView";

export const metadata = {
  title: "Arbitrum Governance",
};

export default function IndexPage() {
  return (
    <ProposalsPageShell>
      <ProposalsView />
    </ProposalsPageShell>
  );
}
