"use client";

import { memo } from "react";

import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@components/ui/Input";

export interface ToolbarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const ToolbarSearch = memo(function ToolbarSearch({
  value,
  onChange,
  placeholder = "Search ...",
  className = "w-full sm:w-[150px] lg:w-[450px]",
}: ToolbarSearchProps) {
  return (
    <div className="relative flex-1 sm:flex-initial group">
      <SearchIcon
        className={cn(
          "absolute top-1/2 left-4 -translate-y-1/2 h-4 w-4",
          "text-muted-foreground/50 transition-colors",
          "group-focus-within:text-primary"
        )}
      />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "pl-11 h-12 text-base",
          "glass-subtle backdrop-blur rounded-xl",
          "focus:ring-2 focus:ring-primary/30 focus:border-primary/50",
          "placeholder:text-muted-foreground/40",
          className
        )}
      />
    </div>
  );
});
