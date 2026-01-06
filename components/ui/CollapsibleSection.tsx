"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { ReactNode, useState } from "react";

import { cn } from "@/lib/utils";

export interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  variant?: "default" | "destructive";
  className?: string;
}

export function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
  variant = "default",
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const variantStyles = {
    default: "text-muted-foreground hover:text-foreground",
    destructive: "text-destructive hover:text-destructive/80",
  };

  return (
    <div className={cn("space-y-3", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center text-sm transition-all duration-200 w-full",
          variantStyles[variant]
        )}
      >
        {isOpen ? (
          <ChevronUp className="w-4 h-4 mr-2 transition-transform duration-200" />
        ) : (
          <ChevronDown className="w-4 h-4 mr-2 transition-transform duration-200" />
        )}
        {icon && <span className="mr-2">{icon}</span>}
        {title}
      </button>

      {isOpen && (
        <div className="pt-2 border-t border-[var(--glass-border)]">
          {children}
        </div>
      )}
    </div>
  );
}
