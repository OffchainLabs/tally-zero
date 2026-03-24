import type {
  SerializableContender,
  SerializableNominee,
} from "@gzeoneth/gov-tracker";
import { ExternalLink, Info } from "lucide-react";
import Link from "next/link";

import { getDelegateLabel } from "@/lib/delegate-cache";
import {
  getCandidateName,
  getCandidateProfileUrl,
  getCandidateTitle,
} from "@/lib/election-utils";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";

import { ContenderQuorumBar } from "./ContenderQuorumBar";

function NomineeSelectionBanner({
  quorumThreshold,
}: {
  quorumThreshold: string;
}) {
  return (
    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
      <div className="flex items-start gap-2 text-blue-500">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium">Nominee Selection</p>
          <p className="text-blue-500/80 mt-1">
            Vote for contenders to endorse them as nominees. Each contender
            needs at least {formatVotingPower(quorumThreshold)} ARB (0.2% of
            votable tokens) to qualify for the compliance check.
          </p>
          <a
            href="https://docs.arbitrum.foundation/dao-constitution#section-4-security-council-elections"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-blue-400 hover:text-blue-300 transition-colors"
          >
            <span>Read the election rules in the DAO Constitution</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

interface ContenderVoteListProps {
  contenders: SerializableContender[];
  nominees: SerializableNominee[];
  quorumThreshold: string;
}

export function ContenderVoteList({
  contenders,
  nominees,
  quorumThreshold,
}: ContenderVoteListProps): React.ReactElement {
  return (
    <div className="space-y-4">
      <NomineeSelectionBanner quorumThreshold={quorumThreshold} />

      <div className="text-sm text-muted-foreground">
        Quorum threshold: {formatVotingPower(quorumThreshold)} ARB per contender
      </div>

      {contenders.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          No contenders registered yet
        </div>
      ) : (
        <div className="space-y-2">
          {contenders.map((contender) => {
            const candidateName = getCandidateName(contender.address);
            const candidateTitle = getCandidateTitle(contender.address);
            const label = candidateName ?? getDelegateLabel(contender.address);
            const profileUrl = getCandidateProfileUrl(contender.address);
            const explorerUrl = getAddressExplorerUrl(contender.address);
            const nomineeData = nominees.find(
              (n) => n.address.toLowerCase() === contender.address.toLowerCase()
            );
            const votes = nomineeData?.votesReceived ?? "0";

            return (
              <div
                key={contender.address}
                className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {profileUrl ? (
                        <Link
                          href={profileUrl}
                          className="text-sm font-medium truncate text-primary underline underline-offset-2 decoration-primary/30 hover:decoration-primary transition-colors"
                        >
                          {label ?? contender.address}
                        </Link>
                      ) : label ? (
                        <span className="text-sm font-medium truncate">
                          {label}
                        </span>
                      ) : (
                        <span className="font-mono text-xs break-all">
                          {shortenAddress(contender.address)}
                        </span>
                      )}
                      {!profileUrl && (
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {candidateTitle && (
                      <p className="text-xs text-muted-foreground truncate">
                        {candidateTitle}
                      </p>
                    )}
                  </div>
                  {profileUrl && (
                    <Link
                      href={profileUrl}
                      className="text-xs font-medium text-primary hover:text-primary/80 transition-colors shrink-0 ml-2"
                    >
                      Vote &rarr;
                    </Link>
                  )}
                </div>
                <ContenderQuorumBar
                  votes={votes}
                  quorumThreshold={quorumThreshold}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
