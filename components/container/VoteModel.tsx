"use client";

import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";

import { proposalSanitizeSchema } from "@lib/sanitize-schema";
import { Fragment, useMemo, useState } from "react";
import { z } from "zod";

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

import { type ProposalTab } from "@/lib/proposal-url";
import { isArbitrumGovernor } from "@config/governors";
import { proposalSchema } from "@config/schema";
import { useNerdMode } from "@context/NerdModeContext";
import { useL1Block } from "@hooks/use-l1-block";
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
  mountedTabs: ReadonlySet<ProposalTab>;
  proposal: z.infer<typeof proposalSchema>;
  showStagesTab: boolean;
  nerdMode: boolean;
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
  currentL1Block: number | null;
}

function ProposalTabsContent({
  mountedTabs,
  proposal,
  showStagesTab,
  nerdMode,
  calldataOverrides,
  onCalldataOverrideChange,
  maxHeight,
  DescriptionWrapper,
  currentL1Block,
}: ProposalTabsContentProps) {
  return (
    <>
      <TabsContent
        forceMount={mountedTabs.has("description") ? true : undefined}
        value="description"
        className="flex-1 min-h-0 data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col"
      >
        <DescriptionWrapper asChild>
          <div
            className={cn(
              "overflow-y-auto text-left glass-subtle backdrop-blur rounded-lg p-4",
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
        forceMount={mountedTabs.has("payload") ? true : undefined}
        value="payload"
        className="flex-1 min-h-0 data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col"
      >
        <div
          className={cn(
            "overflow-y-auto glass-subtle backdrop-blur rounded-lg p-4",
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
          forceMount={mountedTabs.has("stages") ? true : undefined}
          value="stages"
          className="flex-1 min-h-0 data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col"
        >
          <div
            className={cn(
              "overflow-y-auto glass-subtle backdrop-blur rounded-lg",
              maxHeight
            )}
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
          forceMount={mountedTabs.has("stages") ? true : undefined}
          value="stages"
          className="flex-1 min-h-0 data-[state=inactive]:hidden data-[state=active]:flex data-[state=active]:flex-col"
        >
          <div
            className={cn(
              "overflow-y-auto glass-subtle backdrop-blur rounded-lg p-4",
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
    </TabsList>
  );
}

function PlainDescriptionWrapper({
  children,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  return <Fragment>{children}</Fragment>;
}

export default function VoteModel({
  proposal,
  stateValue,
  isDesktop,
  variant = "modal",
  defaultTab = "description",
  onTabChange,
  className,
  calldataOverrides,
  onCalldataOverrideChange,
}: {
  proposal: z.infer<typeof proposalSchema>;
  stateValue: StateValue;
  isDesktop: boolean;
  variant?: "modal" | "page";
  defaultTab?: ProposalTab;
  onTabChange?: (tab: ProposalTab) => void;
  className?: string;
  calldataOverrides: CalldataOverrides;
  onCalldataOverrideChange: (
    index: number,
    newCalldata: string | undefined
  ) => void;
}) {
  const showStagesTab = isArbitrumGovernor(proposal.contractAddress);
  const { nerdMode } = useNerdMode();
  const { currentL1Block } = useL1Block();
  const isControlled = onTabChange !== undefined;
  const normalizedDefaultTab = useMemo(() => {
    if (defaultTab === "stages" && !showStagesTab) return "description";
    return defaultTab;
  }, [defaultTab, showStagesTab]);
  const [uncontrolledActiveTab, setUncontrolledActiveTab] =
    useState<ProposalTab>(normalizedDefaultTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<ProposalTab>>(
    () => new Set<ProposalTab>(["description", "payload", normalizedDefaultTab])
  );
  const activeTab = useMemo(() => {
    const nextTab = isControlled ? normalizedDefaultTab : uncontrolledActiveTab;

    if (nextTab === "stages" && !showStagesTab) return "description";
    return nextTab;
  }, [
    isControlled,
    normalizedDefaultTab,
    uncontrolledActiveTab,
    showStagesTab,
  ]);
  const mountedTabs = useMemo(() => {
    const next = new Set<ProposalTab>([
      "description",
      "payload",
      normalizedDefaultTab,
      activeTab,
    ]);

    for (const tab of visitedTabs) {
      next.add(tab);
    }

    return next;
  }, [activeTab, normalizedDefaultTab, visitedTabs]);

  const handleTabChange = (tab: string) => {
    if (tab !== "description" && tab !== "payload" && tab !== "stages") {
      return;
    }

    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });

    if (!isControlled) {
      setUncontrolledActiveTab(tab);
    }

    onTabChange?.(tab);
  };

  const tabsContentProps = {
    mountedTabs,
    proposal,
    showStagesTab,
    nerdMode,
    calldataOverrides,
    onCalldataOverrideChange,
    currentL1Block,
  };

  if (variant === "page") {
    return (
      <div
        className={`glass rounded-2xl border border-white/40 dark:border-white/10 p-4 sm:p-6 shadow-lg shadow-black/5 ${className}`}
      >
        <div className="mb-4">
          <ProposalHeader stateValue={stateValue} />
        </div>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="flex flex-col"
        >
          <TabsNavigation showStagesTab={showStagesTab} />
          <ProposalTabsContent
            {...tabsContentProps}
            maxHeight=""
            DescriptionWrapper={PlainDescriptionWrapper}
          />
        </Tabs>
      </div>
    );
  }

  if (isDesktop) {
    return (
      <DialogContent className="sm:max-w-[1000px] max-w-sm max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            <ProposalHeader stateValue={stateValue} />
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
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

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col"
      >
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
