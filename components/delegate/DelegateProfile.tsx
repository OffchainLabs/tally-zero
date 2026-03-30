"use client";

import {
  ExternalLink,
  Globe,
  MessageSquareText,
  Twitter,
  User,
  Users,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { getDelegateLabel } from "@/lib/delegate-cache";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import { proposalSanitizeSchema } from "@/lib/sanitize-schema";
import type { TallyDelegate } from "@/types/tally-delegate";

interface DelegateProfileProps {
  address: string;
  delegate: TallyDelegate | null;
}

export function DelegateProfile({ address, delegate }: DelegateProfileProps) {
  const label = getDelegateLabel(address);
  const explorerUrl = getAddressExplorerUrl(address);

  if (!delegate) {
    return (
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <User className="h-6 w-6" />
            {label || "Delegate"}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    );
  }

  const { account, statement } = delegate;
  const displayName = label || account.name || shortenAddress(address);
  const hasStatement = statement.statement.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {account.picture ? (
                <img
                  src={account.picture}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover shrink-0 ring-2 ring-border"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center shrink-0 ring-2 ring-border">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="space-y-1">
                <CardTitle className="text-2xl">{displayName}</CardTitle>
                {account.bio && (
                  <CardDescription className="text-base">
                    {account.bio}
                  </CardDescription>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {statement.isSeekingDelegation && (
                <Badge variant="glass" className="text-xs">
                  Seeking Delegation
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
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

            {account.ens && (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="font-mono text-xs">{account.ens}</span>
              </span>
            )}

            {account.twitter && (
              <a
                href={`https://x.com/${account.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                <Twitter className="h-3.5 w-3.5" />
                <span>@{account.twitter}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats + Statement */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stats cards */}
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
        </div>

        {/* Statement */}
        {hasStatement && (
          <Card variant="glass" className="lg:col-span-2">
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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
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
