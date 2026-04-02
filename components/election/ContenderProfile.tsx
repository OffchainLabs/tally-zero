"use client";

import dynamic from "next/dynamic";

import {
  ExternalLink,
  Globe,
  MapPin,
  ShieldCheck,
  ShieldX,
  User,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAddressExplorerUrl } from "@/lib/explorer-utils";

import candidatesData from "@/data/election-candidates.json";

const CandidateVoteCard = dynamic(
  () =>
    import("./CandidateVoteCard").then((mod) => ({
      default: mod.CandidateVoteCard,
    })),
  {
    ssr: false,
    loading: () => (
      <Card variant="glass">
        <CardContent className="py-6">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    ),
  }
);

interface CandidateSkills {
  canVerifySigning: boolean;
  golang: number;
  solidity: number;
  rust: number;
  javascript: number;
  cyberSecurity: string;
}

interface CandidateData {
  name: string;
  title?: string;
  address: string;
  twitter?: string;
  type: string;
  representative?: string;
  motivation: string;
  experience: string;
  skills: CandidateSkills;
  projects: string;
  country: string;
  registered_at: string;
}

const candidates = candidatesData as Record<string, CandidateData>;

function textToElements(text: string): React.ReactElement[] {
  const blocks = text.split(/\n\n+/);
  const elements: React.ReactElement[] = [];

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    const lines = block.split("\n");
    const bulletLines = lines.filter((l) => /^\s*[-*•]\s/.test(l));

    if (bulletLines.length > 0 && bulletLines.length === lines.length) {
      // Entire block is bullet points
      elements.push(
        <ul key={i} className="list-disc list-inside space-y-1">
          {bulletLines.map((line, j) => (
            <li
              key={j}
              className="text-sm text-muted-foreground leading-relaxed"
            >
              {line.replace(/^\s*[-*•]\s+/, "")}
            </li>
          ))}
        </ul>
      );
    } else if (bulletLines.length > 0) {
      // Mixed: some lines are bullets, some are not
      const parts: React.ReactElement[] = [];
      let runningBullets: string[] = [];

      for (const line of lines) {
        if (/^\s*[-*•]\s/.test(line)) {
          runningBullets.push(line.replace(/^\s*[-*•]\s+/, ""));
        } else {
          if (runningBullets.length > 0) {
            parts.push(
              <ul
                key={`ul-${parts.length}`}
                className="list-disc list-inside space-y-1"
              >
                {runningBullets.map((b, j) => (
                  <li
                    key={j}
                    className="text-sm text-muted-foreground leading-relaxed"
                  >
                    {b}
                  </li>
                ))}
              </ul>
            );
            runningBullets = [];
          }
          parts.push(
            <p
              key={`p-${parts.length}`}
              className="text-sm text-muted-foreground leading-relaxed"
            >
              {line}
            </p>
          );
        }
      }
      if (runningBullets.length > 0) {
        parts.push(
          <ul
            key={`ul-${parts.length}`}
            className="list-disc list-inside space-y-1"
          >
            {runningBullets.map((b, j) => (
              <li
                key={j}
                className="text-sm text-muted-foreground leading-relaxed"
              >
                {b}
              </li>
            ))}
          </ul>
        );
      }
      elements.push(
        <div key={i} className="space-y-2">
          {parts}
        </div>
      );
    } else {
      elements.push(
        <p key={i} className="text-sm text-muted-foreground leading-relaxed">
          {block}
        </p>
      );
    }
    i++;
  }

  return elements;
}

function SkillBar({
  label,
  level,
}: {
  label: string;
  level: number;
}): React.ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{level}/10</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${level * 10}%` }}
        />
      </div>
    </div>
  );
}

interface ContenderProfileProps {
  address: string;
}

export function ContenderProfile({
  address,
}: ContenderProfileProps): React.ReactElement {
  const candidate = Object.entries(candidates).find(
    ([key]) => key.toLowerCase() === address.toLowerCase()
  )?.[1];

  if (!candidate) {
    const explorerUrl = getAddressExplorerUrl(address);
    return (
      <div className="space-y-6">
        <Card variant="glass">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <User className="h-6 w-6" />
              Candidate
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

        <CandidateVoteCard address={address} />
      </div>
    );
  }

  const explorerUrl = getAddressExplorerUrl(candidate.address);

  return (
    <div className="space-y-6">
      <Card variant="glass">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-2xl">{candidate.name}</CardTitle>
              {candidate.title && (
                <CardDescription className="text-base">
                  {candidate.title}
                </CardDescription>
              )}
            </div>
            <Badge
              variant="secondary"
              className="shrink-0 flex items-center gap-1"
            >
              {candidate.type === "organization" ? (
                <Users className="h-3 w-3" />
              ) : (
                <User className="h-3 w-3" />
              )}
              {candidate.type === "organization"
                ? "Organization"
                : "Individual"}
            </Badge>
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
              <span className="font-mono text-xs break-all">
                {candidate.address}
              </span>
              <ExternalLink className="h-3 w-3" />
            </a>

            {candidate.twitter && (
              <a
                href={candidate.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span>Twitter</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <div className="inline-flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              <span>{candidate.country}</span>
            </div>

            {candidate.representative && (
              <div className="inline-flex items-center gap-1.5 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>Representative: {candidate.representative}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col lg:flex-row-reverse gap-5">
        <div className="lg:w-[450px]">
          <CandidateVoteCard address={address} />
        </div>
        <div className="flex space-y-6 flex-col flex-1 min-w-0">
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Motivation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {textToElements(candidate.motivation)}
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardHeader>
              <CardTitle>Experience</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {textToElements(candidate.experience)}
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SkillBar
                    label="Solidity"
                    level={candidate.skills.solidity}
                  />
                  <SkillBar label="Rust" level={candidate.skills.rust} />
                  <SkillBar label="Go" level={candidate.skills.golang} />
                  <SkillBar
                    label="JavaScript"
                    level={candidate.skills.javascript}
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <h4 className="text-sm font-medium">Cybersecurity</h4>
                  <div className="space-y-3">
                    {textToElements(candidate.skills.cyberSecurity)}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  {candidate.skills.canVerifySigning ? (
                    <Badge
                      variant="secondary"
                      className="text-green-500 border-green-500/30 flex items-center gap-1"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      Can independently verify multisig transactions
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="text-red-500 border-red-500/30 flex items-center gap-1"
                    >
                      <ShieldX className="h-3 w-3" />
                      Cannot independently verify multisig transactions
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardHeader>
              <CardTitle>Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {textToElements(candidate.projects)}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
