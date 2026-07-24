"use client";

import { useCallback, useState } from "react";

import { Table } from "@tanstack/react-table";

import { ToolbarResetButton } from "@components/table/ToolbarResetButton";
import { ToolbarSearch } from "@components/table/ToolbarSearch";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
}

export function DataTableToolbar<TData>({
  table,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;
  const [searchValue, setSearchValue] = useState("");

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      table.getColumn("description")?.setFilterValue(value);
    },
    [table]
  );

  const handleReset = useCallback(() => {
    setSearchValue("");
    table.resetColumnFilters();
  }, [table]);

  return (
    <div className="flex items-center gap-2">
      <ToolbarSearch
        value={searchValue}
        onChange={handleSearchChange}
        placeholder="Search Proposals"
        className="w-full sm:w-[280px]"
      />

      {isFiltered && <ToolbarResetButton onClick={handleReset} />}
    </div>
  );
}
