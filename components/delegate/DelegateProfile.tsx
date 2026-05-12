"use client";

import {
  ExternalLink,
  Globe,
  MessageSquareText,
  User,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

import { DelegateVotesLoader } from "@/components/delegate/DelegateVotesLoader";
import { DelegationCard } from "@/components/delegate/DelegationCard";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type { TallyDelegateProfile } from "@/lib/delegate-data";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import { proposalSanitizeSchema } from "@/lib/sanitize-schema";

interface DelegateProfileProps {
  address: string;
  delegate: TallyDelegateProfile | null;
}

type DelegateAccount = TallyDelegateProfile["account"];
type DelegateStatement = TallyDelegateProfile["statement"];

export function DelegateProfile({ address, delegate }: DelegateProfileProps) {
  const explorerUrl = getAddressExplorerUrl(address);

  if (!delegate) {
    return <UnknownDelegateCard address={address} explorerUrl={explorerUrl} />;
  }

  const displayName = getDelegateDisplayName(delegate, address);

  return (
    <div className="space-y-6">
      <DelegateHeaderCard
        account={delegate.account}
        address={address}
        displayName={displayName}
        explorerUrl={explorerUrl}
        statement={delegate.statement}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <DelegateStatsColumn
          delegate={delegate}
          delegateAddress={address}
          delegateName={displayName}
        />

        <DelegateDetailsTabs address={address} statement={delegate.statement} />
      </div>
    </div>
  );
}

export function getDelegateDisplayName(
  delegate: TallyDelegateProfile,
  fallbackAddress: string
): string {
  return (
    delegate.knownLabel ||
    delegate.account.name ||
    delegate.account.ens ||
    shortenAddress(fallbackAddress)
  );
}

function UnknownDelegateCard({
  address,
  explorerUrl,
}: {
  address: string;
  explorerUrl: string;
}) {
  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <User className="h-6 w-6" />
          Delegate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AddressExplorerLink address={address} explorerUrl={explorerUrl} />
      </CardContent>
    </Card>
  );
}

function DelegateHeaderCard({
  account,
  address,
  displayName,
  explorerUrl,
  statement,
}: {
  account: DelegateAccount;
  address: string;
  displayName: string;
  explorerUrl: string;
  statement: DelegateStatement;
}) {
  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <DelegateAvatar picture={account.picture} />
            <div className="space-y-1">
              <CardTitle className="text-2xl">{displayName}</CardTitle>
              {account.bio && (
                <CardDescription className="text-base">
                  {account.bio}
                </CardDescription>
              )}
            </div>
          </div>

          {statement.isSeekingDelegation && (
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="glass" className="text-xs">
                Seeking Delegation
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <DelegateIdentityLinks
          address={address}
          ens={account.ens}
          explorerUrl={explorerUrl}
          twitter={account.twitter}
        />
      </CardContent>
    </Card>
  );
}

function DelegateAvatar({ picture }: { picture?: string | null }) {
  return (
    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center shrink-0 ring-2 ring-border">
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt=""
          className="h-full w-full rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <User className="h-8 w-8 text-muted-foreground" />
      )}
    </div>
  );
}

function DelegateIdentityLinks({
  address,
  ens,
  explorerUrl,
  twitter,
}: {
  address: string;
  ens?: string | null;
  explorerUrl: string;
  twitter?: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <AddressExplorerLink address={address} explorerUrl={explorerUrl} />

      {ens && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="font-mono text-xs">{ens}</span>
        </span>
      )}

      {twitter && <TwitterProfileLink handle={twitter} />}
    </div>
  );
}

function AddressExplorerLink({
  address,
  explorerUrl,
}: {
  address: string;
  explorerUrl: string;
}) {
  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
    >
      <Globe className="h-3.5 w-3.5" />
      <span className="font-mono text-xs break-all">{address}</span>
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function TwitterProfileLink({ handle }: { handle: string }) {
  return (
    <a
      href={`https://x.com/${handle}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
    >
      <TwitterIcon />
      <span>@{handle}</span>
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function TwitterIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DelegateStatsColumn({
  delegate,
  delegateAddress,
  delegateName,
}: {
  delegate: TallyDelegateProfile;
  delegateAddress: string;
  delegateName: string;
}) {
  return (
    <div className="space-y-4">
      <StatCard
        icon={<Users className="h-4 w-4 text-muted-foreground" />}
        label="Voting Power"
        value={`${formatVotingPower(delegate.votesCount)} ARB`}
      />
      <StatCard
        icon={<User className="h-4 w-4 text-muted-foreground" />}
        label="Delegators"
        value={delegate.delegatorsCount.toLocaleString()}
      />
      <DelegationCard
        delegateAddress={delegateAddress}
        delegateName={delegateName}
      />
    </div>
  );
}

function DelegateDetailsTabs({
  address,
  statement,
}: {
  address: string;
  statement: DelegateStatement;
}) {
  return (
    <div className="lg:col-span-2">
      <Tabs defaultValue="statement">
        <TabsList>
          <TabsTrigger value="statement">Delegate Statement</TabsTrigger>
          <TabsTrigger value="votes">Past Votes</TabsTrigger>
        </TabsList>

        <TabsContent value="statement">
          <DelegateStatementCard statement={statement} />
        </TabsContent>

        <TabsContent value="votes">
          <DelegateVotesCard address={address} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DelegateStatementCard({
  statement,
}: {
  statement: DelegateStatement;
}) {
  const hasStatement = statement.statement.trim().length > 0;

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareText className="h-5 w-5" />
          Delegate Statement
        </CardTitle>
        {statement.statementSummary && (
          <CardDescription>{statement.statementSummary}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {hasStatement ? (
          <div className="text-sm break-words prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-ul:text-muted-foreground prose-ol:text-muted-foreground prose-li:text-muted-foreground">
            <ReactMarkdown
              rehypePlugins={[
                [rehypeSanitize, proposalSanitizeSchema],
                rehypeRaw,
              ]}
            >
              {statement.statement}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            This delegate has not published a statement.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DelegateVotesCard({ address }: { address: string }) {
  return (
    <Card variant="glass">
      <CardContent className="pt-6">
        <DelegateVotesLoader address={address} />
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card variant="glass">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
