"use client";

import { useCallback, useState } from "react";

import { Table } from "@tanstack/react-table";
import { ArrowDownUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { ToolbarResetButton } from "@components/table/ToolbarResetButton";
import { ToolbarSearch } from "@components/table/ToolbarSearch";
import { DataTableViewOptions } from "@components/table/ViewOptions";
import { Input } from "@components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@components/ui/Select";

export type DelegateSortOrder = "votingPower" | "random";

interface DelegatesToolbarProps<TData> {
  table: Table<TData>;
  onMinPowerChange?: (value: string) => void;
  sortOrder: DelegateSortOrder;
  onSortOrderChange: (value: DelegateSortOrder) => void;
}

export function DelegatesToolbar<TData>({
  table,
  onMinPowerChange,
  sortOrder,
  onSortOrderChange,
}: DelegatesToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;
  const [searchValue, setSearchValue] = useState("");
  const [minPowerValue, setMinPowerValue] = useState("");

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      table.getColumn("address")?.setFilterValue(value);
    },
    [table]
  );

  const handleMinPowerChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setMinPowerValue(value);
      onMinPowerChange?.(value);
    },
    [onMinPowerChange]
  );

  const handleReset = useCallback(() => {
    setSearchValue("");
    setMinPowerValue("");
    table.resetColumnFilters();
    onMinPowerChange?.("");
  }, [table, onMinPowerChange]);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2 sm:space-x-2">
        <ToolbarSearch
          value={searchValue}
          onChange={handleSearchChange}
          placeholder="Search address..."
          className="w-full sm:w-[150px] lg:w-[300px]"
        />

        <div className="relative">
          <Input
            type="number"
            placeholder="Min voting power (ARB)"
            value={minPowerValue}
            onChange={handleMinPowerChange}
            className={cn(
              "h-12 w-full sm:w-[200px] text-base",
              "glass-subtle backdrop-blur rounded-xl",
              "focus:ring-2 focus:ring-primary/30 focus:border-primary/50",
              "placeholder:text-muted-foreground/40"
            )}
            min="0"
            step="1000"
          />
        </div>

        {isFiltered && <ToolbarResetButton onClick={handleReset} />}
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={sortOrder}
          onValueChange={(v) => onSortOrderChange(v as DelegateSortOrder)}
        >
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <ArrowDownUp className="h-3 w-3 mr-1 shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="votingPower">Voting Power</SelectItem>
            <SelectItem value="random">Random</SelectItem>
          </SelectContent>
        </Select>
        <div className="hidden sm:block">
          <DataTableViewOptions table={table} />
        </div>
      </div>
    </div>
  );
}
