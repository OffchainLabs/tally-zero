"use client";

import type { ElectionProposalStatus } from "@gzeoneth/gov-tracker";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { PHASE_METADATA } from "@/config/security-council";
import type { ElectionPhase } from "@/types/election";

import { ContenderSignupForm } from "./ContenderSignupForm";

interface ElectionActionCardProps {
  phase: ElectionPhase;
  selectedElection: ElectionProposalStatus | null;
}

export function ElectionActionCard({
  phase,
  selectedElection,
}: ElectionActionCardProps): React.ReactElement | null {
  if (!selectedElection) return null;

  const content = getPhaseContent({ phase, selectedElection });

  if (!content) return null;

  const metadata = PHASE_METADATA[phase];

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle>{content.title}</CardTitle>
        <CardDescription>{metadata.description}</CardDescription>
      </CardHeader>
      <CardContent>{content.form}</CardContent>
    </Card>
  );
}

function getPhaseContent({
  phase,
  selectedElection,
}: {
  phase: ElectionPhase;
  selectedElection: ElectionProposalStatus;
}): {
  title: string;
  form: React.ReactElement;
} | null {
  switch (phase) {
    case "CONTENDER_SUBMISSION": {
      if (!selectedElection.nomineeProposalId) return null;
      return {
        title: "Register as Contender",
        form: (
          <ContenderSignupForm
            proposalId={selectedElection.nomineeProposalId}
          />
        ),
      };
    }

    case "NOMINEE_SELECTION": {
      // Voting UI is now integrated into NomineeList
      return null;
    }

    case "MEMBER_ELECTION": {
      // Voting UI is on each nominee's candidate profile page
      return null;
    }

    default:
      return null;
  }
}
