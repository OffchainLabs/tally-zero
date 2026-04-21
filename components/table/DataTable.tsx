"use client";
"use no memo";

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

import { useBreakpoint } from "@/hooks/use-breakpoint";
import { ParsedProposal } from "@/types/proposal";
import { MobileProposalList } from "@components/table/MobileProposalCard";
import { DataTablePagination } from "@components/table/Pagination";
import { StatusFilterHeader } from "@components/table/StatusFilterHeader";
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

  // Single hook for all breakpoints (more efficient than 5 separate media queries)
  const { isMobile, sm, md, lg, xl } = useBreakpoint();

  // Compute column visibility based on breakpoints
  const defaultColumnVisibility = React.useMemo<VisibilityState>(
    () => ({
      proposer: xl,
      votes: lg,
      governorName: md,
      lifecycle: sm,
    }),
    [xl, lg, md, sm]
  );
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>(defaultColumnVisibility);

  React.useEffect(() => {
    setColumnVisibility(defaultColumnVisibility);
  }, [defaultColumnVisibility]);

  // eslint-disable-next-line react-hooks/incompatible-library
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
    onColumnVisibilityChange: setColumnVisibility,
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

  // Cache row model to avoid repeated calls in render
  const rows = table.getRowModel().rows;

  return (
    <div className="space-y-4">
      <DataTableToolbar table={table} />

      {isMobile ? (
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
                      const isStatusColumn = header.column.id === "lifecycle";
                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          style={size ? { width: size } : undefined}
                        >
                          {header.isPlaceholder ? null : isStatusColumn ? (
                            <StatusFilterHeader
                              column={header.column}
                              title="Status"
                            />
                          ) : (
                            flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.length > 0 ? (
                  rows.map((row) => (
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

      {isPaginated && !isMobile && <DataTablePagination table={table} />}
    </div>
  );
}
