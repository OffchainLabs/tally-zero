"use client";

import { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { z } from "zod";

import VoteForm from "@components/form/VoteForm";
import { PayloadView, type CalldataOverrides } from "@components/payload";
import ProposalStages from "@components/proposal/ProposalStages";
import ProposalStagesError from "@components/proposal/ProposalStagesError";
import { Badge } from "@components/ui/Badge";
import { ErrorBoundary } from "@components/ui/ErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/Tabs";

import { isArbitrumGovernor } from "@config/governors";
import { proposalSchema } from "@config/schema";
import { useNerdMode } from "@context/NerdModeContext";
import { useL1Block } from "@hooks/use-l1-block";
import { proposalSanitizeSchema } from "@lib/sanitize-schema";
import { cn } from "@lib/utils";

export type ProposalDetailTab = "description" | "payload" | "stages" | "vote";

interface ProposalDetailProps {
  proposal: z.infer<typeof proposalSchema>;
  defaultTab?: ProposalDetailTab;
  /** Tailwind max-height for scroll regions inside tab panels */
  maxHeight?: string;
  /** Optional wrapper for the description panel (e.g., DialogDescription) */
  descriptionWrapperAsChild?: boolean;
  DescriptionWrapper?: React.ComponentType<{
    children: React.ReactNode;
    asChild?: boolean;
  }>;
}

/**
 * Renders proposal tabs: Description / Payload / Lifecycle / Vote.
 *
 * Presentation-only — the caller chooses the outer container
 * (modal, drawer, or full-page layout).
 */
export function ProposalDetail({
  proposal,
  defaultTab = "description",
  maxHeight = "max-h-[60vh]",
  DescriptionWrapper,
}: ProposalDetailProps) {
  const showStagesTab = isArbitrumGovernor(proposal.contractAddress);
  const { nerdMode } = useNerdMode();
  const { currentL1Block } = useL1Block();
  const [calldataOverrides, setCalldataOverrides] = useState<CalldataOverrides>(
    {}
  );

  const handleCalldataOverrideChange = useCallback(
    (index: number, newCalldata: string | undefined) => {
      setCalldataOverrides((prev) => {
        if (newCalldata === undefined) {
          const next = { ...prev };
          delete next[index];
          return next;
        }
        return { ...prev, [index]: newCalldata };
      });
    },
    []
  );

  const hasCalldataOverrides = Object.keys(calldataOverrides).length > 0;

  const DescWrap = DescriptionWrapper ?? DescriptionPassthrough;

  return (
    <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0">
      <TabsList className="flex-shrink-0 w-full justify-start">
        <TabsTrigger value="description">Description</TabsTrigger>
        <TabsTrigger value="payload">Payload</TabsTrigger>
        {showStagesTab && <TabsTrigger value="stages">Lifecycle</TabsTrigger>}
        <TabsTrigger value="vote">Vote</TabsTrigger>
      </TabsList>

      <TabsContent
        value="description"
        className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
      >
        <DescWrap asChild>
          <div
            className={cn(
              "overflow-y-auto text-left glass-subtle rounded-lg p-4",
              maxHeight
            )}
          >
            <h3 className="text-sm font-semibold mb-2 text-foreground">
              Description
            </h3>
            <div className="text-sm break-words prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-ul:text-muted-foreground prose-ol:text-muted-foreground prose-li:text-muted-foreground">
              <ReactMarkdown
                rehypePlugins={[
                  [rehypeSanitize, proposalSanitizeSchema],
                  rehypeRaw,
                ]}
              >
                {proposal.description}
              </ReactMarkdown>
            </div>
          </div>
        </DescWrap>
      </TabsContent>

      <TabsContent
        value="payload"
        className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
      >
        <div
          className={cn(
            "overflow-y-auto glass-subtle rounded-lg p-4",
            maxHeight
          )}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Proposal Actions ({proposal.targets.length})
            </h3>
            {nerdMode && (
              <Badge variant="outline" className="text-[10px]">
                Nerd Mode
              </Badge>
            )}
          </div>
          <PayloadView
            targets={proposal.targets}
            values={proposal.values}
            calldatas={proposal.calldatas}
            nerdMode={nerdMode}
            calldataOverrides={calldataOverrides}
            onCalldataOverrideChange={handleCalldataOverrideChange}
            governorAddress={proposal.contractAddress}
          />
        </div>
      </TabsContent>

      {showStagesTab && proposal.creationTxHash && (
        <TabsContent
          value="stages"
          className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
        >
          <div
            className={cn("overflow-y-auto glass-subtle rounded-lg", maxHeight)}
          >
            <ErrorBoundary
              fallback={(error, reset) => (
                <ProposalStagesError error={error} onReset={reset} />
              )}
            >
              <ProposalStages
                proposalId={proposal.id}
                creationTxHash={proposal.creationTxHash}
                governorAddress={proposal.contractAddress}
                currentL1Block={currentL1Block ?? undefined}
              />
            </ErrorBoundary>
          </div>
        </TabsContent>
      )}

      {showStagesTab && !proposal.creationTxHash && (
        <TabsContent
          value="stages"
          className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
        >
          <div
            className={cn(
              "overflow-y-auto glass-subtle rounded-lg p-4",
              maxHeight
            )}
          >
            <p className="text-sm text-muted-foreground">
              Stage tracking is not available for this proposal. The creation
              transaction hash was not found.
            </p>
          </div>
        </TabsContent>
      )}

      <TabsContent
        value="vote"
        className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
      >
        <div className="pt-4">
          {nerdMode && hasCalldataOverrides && (
            <div className="mb-4 glass-subtle bg-orange-500/10 border-orange-500/30 rounded-lg p-3 text-xs text-orange-600 dark:text-orange-400">
              You have calldata overrides active in the Payload tab.
            </div>
          )}
          <VoteForm proposal={proposal} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function DescriptionPassthrough({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
