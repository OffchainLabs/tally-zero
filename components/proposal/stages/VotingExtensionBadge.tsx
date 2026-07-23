"use client";

import { Badge } from "@/components/ui/Badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { ExternalLinkIcon } from "@radix-ui/react-icons";

export const LATE_QUORUM_EXTENSION_DOCS_URL =
  "https://docs.arbitrum.foundation/dao-glossary#late-quorum-extension";

/**
 * "+2d extension possible" badge with an explanation tooltip, linking to the
 * Arbitrum DAO glossary entry on the late quorum extension.
 */
export function VotingExtensionBadge() {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <a
            href={LATE_QUORUM_EXTENSION_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="+2d extension possible. Learn about the late quorum extension in the Arbitrum DAO docs"
          >
            <Badge
              variant="outline"
              className="text-xs py-0 px-2 glass-subtle backdrop-blur cursor-pointer transition-colors hover:text-primary"
            >
              +2d extension possible
              <ExternalLinkIcon className="ml-1 h-3 w-3" aria-hidden />
            </Badge>
          </a>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[280px] text-xs backdrop-blur"
        >
          If quorum is reached late, the voting period is extended so that
          delegates always have at least 2 more days to vote after quorum,
          making the voting period at most 16 days. Click to read more in the
          Arbitrum DAO docs.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
