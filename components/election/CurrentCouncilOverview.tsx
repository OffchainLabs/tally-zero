import { ExternalLink } from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { formatCohort } from "@/config/security-council";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import type {
  CouncilMember,
  SecurityCouncilSnapshot,
} from "@/lib/security-council/server";

interface CurrentCouncilOverviewProps {
  council: SecurityCouncilSnapshot;
}

const TERM_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatTermEnd(unixSeconds: number | null): string | null {
  if (!unixSeconds || unixSeconds <= 0) return null;
  return TERM_FORMATTER.format(new Date(unixSeconds * 1000));
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function CurrentCouncilOverview({
  council,
}: CurrentCouncilOverviewProps): React.ReactElement {
  return (
    <section
      aria-label="Current Security Council"
      className="grid gap-3 md:grid-cols-2"
    >
      <CohortCard
        cohort={0}
        members={council.firstCohort}
        termEnd={council.firstCohortTermEnd}
      />
      <CohortCard
        cohort={1}
        members={council.secondCohort}
        termEnd={council.secondCohortTermEnd}
      />
    </section>
  );
}

interface CohortCardProps {
  cohort: 0 | 1;
  members: CouncilMember[];
  termEnd: number | null;
}

function CohortCard({ cohort, members, termEnd }: CohortCardProps) {
  const termEndLabel = formatTermEnd(termEnd);

  return (
    <Card className="p-3">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-semibold tracking-tight">
          {formatCohort(cohort)}
        </h3>
        {termEndLabel && (
          <span className="text-xs text-muted-foreground">
            Term ends ~{termEndLabel}
          </span>
        )}
      </header>
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No members returned by SecurityCouncilManager.
        </p>
      ) : (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {members.map((member) => (
            <CohortMemberRow key={member.address} member={member} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CohortMemberRow({ member }: { member: CouncilMember }) {
  const explorerUrl = getAddressExplorerUrl(member.address);
  const display = member.label ?? truncateAddress(member.address);

  return (
    <li className="flex items-center gap-1 text-xs">
      {member.profileUrl ? (
        <Link
          href={member.profileUrl}
          className="font-medium hover:text-primary transition-colors"
        >
          {display}
        </Link>
      ) : (
        <span className={`font-medium ${member.label ? "" : "font-mono"}`}>
          {display}
        </span>
      )}
      {member.title && (
        <span className="text-muted-foreground">({member.title})</span>
      )}
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
        title="View on Arbiscan"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </li>
  );
}
