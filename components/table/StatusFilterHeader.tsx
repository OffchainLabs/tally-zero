"use client";

import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";
import { Column } from "@tanstack/react-table";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/Popover";
import { cn } from "@/lib/utils";
import { Button } from "@components/ui/Button";

const STATUS_OPTIONS = [
  { label: "Pending", value: "Pending" },
  { label: "Active", value: "Active" },
  { label: "Executed", value: "Executed" },
  { label: "Defeated", value: "Defeated" },
  { label: "Queued", value: "Queued" },
] as const;

interface StatusFilterHeaderProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
}

export function StatusFilterHeader<TData, TValue>({
  column,
  title,
}: StatusFilterHeaderProps<TData, TValue>) {
  const selectedValues = new Set(column.getFilterValue() as string[]);

  const toggleValue = (value: string) => {
    const next = new Set(selectedValues);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    const filterValues = Array.from(next);
    column.setFilterValue(filterValues.length ? filterValues : undefined);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "-ml-3 h-8 hover:bg-white/20 dark:hover:bg-white/10 data-[state=open]:bg-white/20 dark:data-[state=open]:bg-white/10 transition-colors backdrop-blur",
            selectedValues.size > 0 && "text-primary"
          )}
        >
          <span>{title}</span>
          {selectedValues.size > 0 && (
            <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
              {selectedValues.size}
            </span>
          )}
          <ChevronDownIcon className="ml-1 h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-1 backdrop-blur" align="start">
        <div className="flex flex-col">
          {STATUS_OPTIONS.map((option) => {
            const isSelected = selectedValues.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleValue(option.value)}
                className="flex items-center rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-white/20 dark:hover:bg-white/10 transition-colors text-left"
              >
                <div
                  className={cn(
                    "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "opacity-50 [&_svg]:invisible"
                  )}
                >
                  <CheckIcon className="h-4 w-4" />
                </div>
                <span>{option.label}</span>
              </button>
            );
          })}
          {selectedValues.size > 0 && (
            <>
              <div className="my-1 h-px bg-white/20" />
              <button
                type="button"
                onClick={() => column.setFilterValue(undefined)}
                className="rounded-lg px-2 py-1.5 text-sm text-center outline-none hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
              >
                Clear filter
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
