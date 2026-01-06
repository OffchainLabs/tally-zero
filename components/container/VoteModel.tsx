"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

import { proposalSanitizeSchema } from "@lib/sanitize-schema";
import { useCallback, useState } from "react";
import { z } from "zod";

import VoteForm from "@components/form/VoteForm";
import { PayloadView, type CalldataOverrides } from "@components/payload";
import ProposalStages from "@components/proposal/ProposalStages";
import ProposalStagesError from "@components/proposal/ProposalStagesError";
import { Badge } from "@components/ui/Badge";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@components/ui/Dialog";
import {
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@components/ui/Drawer";
import { ErrorBoundary } from "@components/ui/ErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/Tabs";

import { isArbitrumGovernor } from "@config/governors";
import { proposalSchema } from "@config/schema";
import { useNerdMode } from "@context/NerdModeContext";
import { cn } from "@lib/utils";

interface StateValue {
  value: string;
  label: string;
  bgColor: string;
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
}

interface ProposalTabsContentProps {
  proposal: z.infer<typeof proposalSchema>;
  showStagesTab: boolean;
  nerdMode: boolean;
  hasCalldataOverrides: boolean;
  calldataOverrides: CalldataOverrides;
  onCalldataOverrideChange: (
    index: number,
    newCalldata: string | undefined
  ) => void;
  maxHeight: string;
  DescriptionWrapper: React.ComponentType<{
    children: React.ReactNode;
    asChild?: boolean;
  }>;
}

function ProposalTabsContent({
  proposal,
  showStagesTab,
  nerdMode,
  hasCalldataOverrides,
  calldataOverrides,
  onCalldataOverrideChange,
  maxHeight,
  DescriptionWrapper,
}: ProposalTabsContentProps) {
  return (
    <>
      <TabsContent
        value="description"
        className="flex-1 min-h-0 data-[state=active]:flex data-[state=active]:flex-col"
      >
        <DescriptionWrapper asChild>
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
        </DescriptionWrapper>
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
            onCalldataOverrideChange={onCalldataOverrideChange}
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
    </>
  );
}

interface ProposalHeaderProps {
  stateValue: StateValue;
}

function ProposalHeader({ stateValue }: ProposalHeaderProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <span>Proposal</span>
      <Badge
        className={cn(
          "text-xs font-semibold inline-flex items-center",
          stateValue.bgColor
        )}
      >
        <stateValue.icon className="mr-1" style={{ strokeWidth: "2" }} />
        {stateValue.label}
      </Badge>
    </div>
  );
}

interface TabsNavigationProps {
  showStagesTab: boolean;
}

function TabsNavigation({ showStagesTab }: TabsNavigationProps) {
  return (
    <TabsList className="flex-shrink-0 w-full justify-start">
      <TabsTrigger value="description">Description</TabsTrigger>
      <TabsTrigger value="payload">Payload</TabsTrigger>
      {showStagesTab && <TabsTrigger value="stages">Lifecycle</TabsTrigger>}
      <TabsTrigger value="vote">Vote</TabsTrigger>
    </TabsList>
  );
}

export default function VoteModel({
  proposal,
  stateValue,
  isDesktop,
  defaultTab = "description",
}: {
  proposal: z.infer<typeof proposalSchema>;
  stateValue: StateValue;
  isDesktop: boolean;
  defaultTab?: "description" | "payload" | "stages" | "vote";
}) {
  const showStagesTab = isArbitrumGovernor(proposal.contractAddress);
  const { nerdMode } = useNerdMode();
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

  const tabsContentProps = {
    proposal,
    showStagesTab,
    nerdMode,
    hasCalldataOverrides,
    calldataOverrides,
    onCalldataOverrideChange: handleCalldataOverrideChange,
  };

  if (isDesktop) {
    return (
      <DialogContent className="sm:max-w-[1000px] max-w-sm max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            <ProposalHeader stateValue={stateValue} />
          </DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue={defaultTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsNavigation showStagesTab={showStagesTab} />
          <ProposalTabsContent
            {...tabsContentProps}
            maxHeight="max-h-[60vh]"
            DescriptionWrapper={DialogDescription}
          />
        </Tabs>
      </DialogContent>
    );
  }

  return (
    <DrawerContent className="sm:max-w-[700px] px-4 py-4 max-h-[85vh]">
      <DrawerHeader className="flex-shrink-0">
        <DrawerTitle>
          <ProposalHeader stateValue={stateValue} />
        </DrawerTitle>
      </DrawerHeader>

      <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col">
        <TabsNavigation showStagesTab={showStagesTab} />
        <ProposalTabsContent
          {...tabsContentProps}
          maxHeight="max-h-[50vh]"
          DescriptionWrapper={DrawerDescription}
        />
      </Tabs>
    </DrawerContent>
  );
}
