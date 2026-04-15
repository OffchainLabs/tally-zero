"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@components/ui/Tooltip";
import { useCopyToClipboard } from "@hooks/use-copy-to-clipboard";
import { cn } from "@lib/utils";
import { CheckIcon, CopyIcon } from "@radix-ui/react-icons";

interface CopyableTextProps {
  value: string;
  displayText?: string;
  maxLength?: number;
  className?: string;
  mono?: boolean;
  tooltipText?: string;
  showCopyButton?: boolean;
}

export function CopyableText({
  value,
  displayText,
  maxLength = 50,
  className,
  mono = true,
  tooltipText,
  showCopyButton = false,
}: CopyableTextProps) {
  const { copied, copy } = useCopyToClipboard();

  const truncatedText =
    displayText ??
    (value.length > maxLength
      ? value.slice(0, Math.floor(maxLength / 2)) +
        "..." +
        value.slice(-Math.floor(maxLength / 2) + 3)
      : value);

  const isTruncated = truncatedText !== value;

  const handleCopy = () => copy(value);

  const content = (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1.5 group cursor-pointer transition-all duration-200 text-left",
        "hover:text-primary",
        showCopyButton && "glass-subtle backdrop-blur rounded-lg px-2.5 py-1.5",
        mono && "font-mono",
        className
      )}
      title={isTruncated ? undefined : "Click to copy"}
    >
      <span className="break-all">{truncatedText}</span>
      {showCopyButton ? (
        <span
          className={cn(
            "p-1 rounded transition-all duration-200",
            "hover:bg-white/20 dark:hover:bg-white/10",
            copied && "text-emerald-500"
          )}
        >
          {copied ? (
            <CheckIcon className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <CopyIcon className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
          )}
        </span>
      ) : copied ? (
        <CheckIcon className="w-3 h-3 text-emerald-500 shrink-0 transition-all duration-200" />
      ) : (
        <CopyIcon className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0 transition-all duration-200" />
      )}
    </button>
  );

  if (isTruncated) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent
            side="top"
            className="glass rounded-lg max-w-[400px] break-all font-mono text-xs"
          >
            <p>{tooltipText ?? "Click to copy full value:"}</p>
            <p className="text-muted-foreground mt-1 max-h-[200px] overflow-y-auto">
              {value}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}
