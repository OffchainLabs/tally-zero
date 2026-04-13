"use client";

import { useCallback, useState } from "react";

import { Table } from "@tanstack/react-table";

import { ToolbarResetButton } from "@components/table/ToolbarResetButton";
import { ToolbarSearch } from "@components/table/ToolbarSearch";
import { DataTableViewOptions } from "@components/table/ViewOptions";

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
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-1 items-center gap-2 sm:space-x-2">
        <ToolbarSearch
          value={searchValue}
          onChange={handleSearchChange}
          placeholder="Search ..."
          className="w-full sm:w-[150px] lg:w-[450px]"
        />

        {/* {table.getColumn("state") && (
          <DataTableFacetedFilter
            column={table.getColumn("state")}
            title="State"
            options={states}
          />
        )} */}

        {isFiltered && <ToolbarResetButton onClick={handleReset} />}
      </div>
      <div className="hidden sm:block">
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
