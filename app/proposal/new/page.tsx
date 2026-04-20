import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import CreateProposalForm from "@/components/form/CreateProposalForm";

export const metadata = {
  title: "New Proposal | Arbitrum Governance",
  description:
    "Create a new proposal in the Arbitrum Core or Treasury Governor.",
};

export default function NewProposalPage() {
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
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            New Proposal
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Submit a proposal to the Arbitrum Core or Treasury Governor. The
            transaction is simulated before submission — make sure you hold
            enough voting power to meet the proposal threshold.
          </p>
        </div>

        <CreateProposalForm />
      </div>
    </div>
  );
}
