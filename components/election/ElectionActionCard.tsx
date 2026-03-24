"use client";

import type {
  ElectionProposalStatus,
  SerializableMemberDetails,
  SerializableNomineeDetails,
} from "@gzeoneth/gov-tracker";

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
import { NomineeVoteForm } from "./NomineeVoteForm";

interface ElectionActionCardProps {
  phase: ElectionPhase;
  selectedElection: ElectionProposalStatus | null;
  nomineeDetails: SerializableNomineeDetails | null;
  memberDetails: SerializableMemberDetails | null;
  bypassSimulation?: boolean;
}

export function ElectionActionCard({
  phase,
  selectedElection,
  nomineeDetails,
  memberDetails,
  bypassSimulation = false,
}: ElectionActionCardProps): React.ReactElement | null {
  if (!selectedElection) return null;

  const content = getPhaseContent({
    phase,
    selectedElection,
    nomineeDetails,
    memberDetails,
    bypassSimulation,
  });

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

interface PhaseContentInput {
  phase: ElectionPhase;
  selectedElection: ElectionProposalStatus;
  nomineeDetails: SerializableNomineeDetails | null;
  memberDetails: SerializableMemberDetails | null;
  bypassSimulation: boolean;
}

function getPhaseContent({
  phase,
  selectedElection,
  nomineeDetails,
  memberDetails,
  bypassSimulation,
}: PhaseContentInput): {
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
      if (!selectedElection.memberProposalId || !memberDetails) return null;
      return {
        title: "Vote for Nominees",
        form: (
          <NomineeVoteForm
            proposalId={selectedElection.memberProposalId}
            nominees={memberDetails.nominees}
            fullWeightDeadline={memberDetails.fullWeightDeadline}
            bypassSimulation={bypassSimulation}
          />
        ),
      };
    }

    default:
      return null;
  }
}
