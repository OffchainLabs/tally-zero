import { ExternalLink, KeyRound } from "lucide-react";

import { Card } from "@/components/ui/Card";
import {
  CANDIDATE_ROTATION_CUTOFF_DAYS,
  DAO_CONSTITUTION_ELECTIONS_URL,
  MEMBER_ROTATION_TIMELOCK_DAYS,
} from "@/config/security-council";

/**
 * Explains the two key rotation paths the DAO added in the "Security Council
 * Election Process Improvements" AIP. Rotations used to require the Council to
 * take a non-emergency action; members and candidates can now start one
 * themselves, which changes what a reader should expect to see on this page.
 */
export function KeyRotationInfo(): React.ReactElement {
  return (
    <Card className="p-3">
      <header className="mb-2 flex items-center gap-2">
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">Key rotation</h3>
      </header>

      <ul className="space-y-1.5 text-xs text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Sitting members</span>{" "}
          can rotate their own signing key at any point in their term. The
          rotation runs the full governance timelock (about{" "}
          {MEMBER_ROTATION_TIMELOCK_DAYS} days) before the new signer is
          registered in the Security Council multisigs on Arbitrum One, Ethereum
          and Arbitrum Nova, and the Security Council can veto a rotation that
          fails compliance checks.
        </li>
        <li>
          <span className="font-medium text-foreground">
            Candidates in an election
          </span>{" "}
          can rotate the key they registered with during the compliance phase,
          up to {CANDIDATE_ROTATION_CUTOFF_DAYS} days before that phase ends,
          which leaves the Arbitrum Foundation time to veto an improper
          rotation.
        </li>
        <li>
          A member or candidate requesting a rotation is expected to announce it
          on the forum once it is submitted on chain.
        </li>
      </ul>

      <a
        href={DAO_CONSTITUTION_ELECTIONS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary"
      >
        <span>Read the election rules in the DAO Constitution</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    </Card>
  );
}
