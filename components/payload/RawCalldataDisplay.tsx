"use client";

import { Button } from "@components/ui/Button";
import { useCopyToClipboard } from "@hooks/use-copy-to-clipboard";
import {
  CheckIcon,
  CopyIcon,
  Pencil1Icon,
  ResetIcon,
} from "@radix-ui/react-icons";

export interface RawCalldataDisplayProps {
  calldata: string;
  nerdMode: boolean;
  isOverridden: boolean;
  onEdit: () => void;
  onReset: () => void;
}

/**
 * Raw calldata display with copy button and optional edit/reset controls
 */
export function RawCalldataDisplay({
  calldata,
  nerdMode,
  isOverridden,
  onEdit,
  onReset,
}: RawCalldataDisplayProps) {
  const { copied, copy } = useCopyToClipboard();

  const handleCopy = () => copy(calldata);

  return (
    <div className="space-y-3">
      <div className="relative group">
        <code className="text-xs font-mono break-all block glass-subtle rounded-lg p-3 pr-10 max-h-28 overflow-y-auto transition-all duration-200">
          {calldata}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-background/50 hover:bg-background/80 border border-border/50 transition-all duration-200 hover:shadow-sm"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckIcon className="w-3.5 h-3.5 text-emerald-500" />
          ) : (
            <CopyIcon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          )}
        </button>
      </div>
      {nerdMode && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onEdit}
            className="transition-all duration-200 hover:bg-primary/5"
          >
            <Pencil1Icon className="w-3 h-3 mr-1.5" />
            Edit
          </Button>
          {isOverridden && (
            <Button
              size="sm"
              variant="outline"
              onClick={onReset}
              className="transition-all duration-200 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:border-rose-300 dark:hover:border-rose-800 hover:text-rose-600 dark:hover:text-rose-400"
            >
              <ResetIcon className="w-3 h-3 mr-1.5" />
              Reset
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
