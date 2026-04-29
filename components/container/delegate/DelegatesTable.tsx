"use client";
"use no memo";

import { columns } from "@/components/table/ColumnsDelegates";
import {
  DelegatesToolbar,
  type DelegateSortOrder,
} from "@/components/table/DelegatesToolbar";
import { DataTablePagination } from "@/components/table/Pagination";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { buildShuffleMap, sortByOrderMap } from "@/lib/collection-utils";
import type { DelegateInfo } from "@/types/delegate";
import {
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
import { useEffect, useMemo, useRef, useState } from "react";

export interface DelegatesTableProps {
  delegates: DelegateInfo[];
  totalVotingPower: string;
  isLoading: boolean;
  error: Error | null;
  rpcHealthy: boolean | null;
  minPowerFloor: number;
  onMinPowerChange: (value: string) => void;
  onVisibleRowsChange: (addresses: string[]) => void;
}

export function DelegatesTable({
  delegates,
  totalVotingPower,
  isLoading,
  error,
  rpcHealthy,
  minPowerFloor,
  onMinPowerChange,
  onVisibleRowsChange,
}: DelegatesTableProps) {
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [sortOrder, setSortOrder] = useState<DelegateSortOrder>("votingPower");
  const prevSortOrderRef = useRef(sortOrder);
  const randomOrderRef = useRef<Map<string, number>>(new Map());
  const randomOrderKeyRef = useRef("");
  const lastAddressesRef = useRef<string>("");
  const delegateAddressKey = useMemo(
    () =>
      delegates
        .map((delegate) => delegate.address.toLowerCase())
        .sort()
        .join(","),
    [delegates]
  );

  const sortedDelegates = useMemo(() => {
    if (sortOrder !== "random") {
      prevSortOrderRef.current = sortOrder;
      return delegates;
    }

    const shouldRefreshRandomOrder =
      prevSortOrderRef.current !== "random" ||
      randomOrderKeyRef.current !== delegateAddressKey;

    if (shouldRefreshRandomOrder) {
      randomOrderRef.current = buildShuffleMap(
        delegates.map((delegate) => delegate.address.toLowerCase())
      );
      randomOrderKeyRef.current = delegateAddressKey;
    }

    prevSortOrderRef.current = sortOrder;

    return sortByOrderMap(
      delegates,
      (delegate) => delegate.address.toLowerCase(),
      randomOrderRef.current
    );
  }, [delegateAddressKey, delegates, sortOrder]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<DelegateInfo>({
    data: sortedDelegates,
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
    meta: {
      totalVotingPower,
    },
  });

  const visibleRows = table.getRowModel().rows;

  useEffect(() => {
    if (visibleRows.length > 0) {
      const visibleAddresses = visibleRows.map((row) => row.original.address);
      const addressesKey = visibleAddresses.join(",");
      if (lastAddressesRef.current !== addressesKey) {
        lastAddressesRef.current = addressesKey;
        onVisibleRowsChange(visibleAddresses);
      }
    }
  }, [visibleRows, onVisibleRowsChange]);

  return (
    <section id="delegates-table">
      <RpcUnhealthyMessage show={rpcHealthy === false} />
      <LoadingState show={isLoading} />
      <ErrorMessage error={error} />

      {delegates.length > 0 && !error && (
        <div className="space-y-4 overflow-hidden">
          <DelegatesToolbar
            table={table}
            minPowerFloor={minPowerFloor}
            onMinPowerChange={onMinPowerChange}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
          />

          <div className="relative">
            <div className="glass rounded-2xl overflow-x-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        return (
                          <TableHead key={header.id} colSpan={header.colSpan}>
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
                  {visibleRows.length > 0 ? (
                    visibleRows.map((row) => (
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
                        No delegates found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="hidden sm:block md:hidden absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none rounded-r-2xl" />
          </div>

          <DataTablePagination table={table} />
        </div>
      )}

      <EmptyState
        show={delegates.length === 0 && !isLoading && !error}
        rpcHealthy={rpcHealthy}
      />
    </section>
  );
}

function RpcUnhealthyMessage({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="glass-subtle backdrop-blur rounded-2xl p-8 flex flex-col items-center justify-center">
      <p className="text-sm text-red-600 dark:text-red-400">
        Cannot connect to Arbitrum RPC. Please check your connection or try a
        different RPC URL in settings.
      </p>
    </div>
  );
}

function LoadingState({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="glass-subtle backdrop-blur rounded-2xl p-8 flex flex-col items-center justify-center space-y-4">
      <div className="space-y-2 w-full max-w-md">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <p className="text-sm text-muted-foreground">Loading delegates...</p>
    </div>
  );
}

function ErrorMessage({ error }: { error: Error | null }) {
  if (!error) return null;

  return (
    <div className="glass-subtle backdrop-blur rounded-2xl p-4 border-red-200/50 dark:border-red-800/50 bg-red-50/50 dark:bg-red-900/20">
      <p className="text-sm text-red-600 dark:text-red-400">
        Error: {error.message}. Please try again.
      </p>
    </div>
  );
}

function EmptyState({
  show,
  rpcHealthy,
}: {
  show: boolean;
  rpcHealthy: boolean | null;
}) {
  if (!show || rpcHealthy === false) return null;

  return (
    <div className="glass-subtle backdrop-blur rounded-2xl p-8 flex flex-col items-center justify-center">
      <p className="text-sm text-muted-foreground">
        No delegates found. Try adjusting your filters.
      </p>
    </div>
  );
}
