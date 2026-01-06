"use client";

import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@components/ui/Table";

import { useMediaQuery } from "@/hooks/use-media-query";
import { ParsedProposal } from "@/types/proposal";
import { MobileProposalList } from "@components/table/MobileProposalCard";
import { DataTablePagination } from "@components/table/Pagination";
import { DataTableToolbar } from "@components/table/Toolbar";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isPaginated: boolean;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isPaginated = true,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // Use media queries for responsive column visibility (more efficient than resize events)
  const isMobileView = useMediaQuery("(max-width: 639px)");
  const isSmallScreen = useMediaQuery("(min-width: 640px)");
  const isMediumScreen = useMediaQuery("(min-width: 768px)");
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const isXLScreen = useMediaQuery("(min-width: 1280px)");

  // Compute column visibility based on breakpoints
  const columnVisibility = React.useMemo<VisibilityState>(
    () => ({
      proposer: isXLScreen,
      votes: isLargeScreen,
      governorName: isMediumScreen,
      id: isSmallScreen,
      state: false, // Hidden - lifecycle/status column shows similar info
      lifecycle: isSmallScreen,
    }),
    [isXLScreen, isLargeScreen, isMediumScreen, isSmallScreen]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const filteredData = table
    .getFilteredRowModel()
    .rows.map((row) => row.original);

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} />

      {isMobileView ? (
        <MobileProposalList proposals={filteredData as ParsedProposal[]} />
      ) : (
        <div className="relative overflow-x-auto">
          <div className="glass rounded-2xl overflow-clip">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const size = header.column.columnDef.size;
                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          style={size ? { width: size } : undefined}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No proposals found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="hidden sm:block md:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none rounded-r-2xl" />
        </div>
      )}

      {isPaginated && !isMobileView && <DataTablePagination table={table} />}
    </div>
  );
}
