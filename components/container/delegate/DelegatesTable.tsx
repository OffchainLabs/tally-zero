"use client";
"use no memo";

import { columns } from "@/components/table/ColumnsDelegates";
import { DelegatesToolbar } from "@/components/table/DelegatesToolbar";
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
import type { DelegateSortOrder } from "@/hooks/use-delegate-search";
import {
  getDelegateSummaries,
  type TallyDelegateSummary,
} from "@/lib/delegate-cache";
import type { DelegateInfo } from "@/types/delegate";
import {
  ColumnFiltersState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";

export interface DelegatesTableProps {
  delegates: DelegateInfo[];
  totalVotingPower: string;
  isLoading: boolean;
  error: Error | null;
  rpcHealthy: boolean | null;
  minPowerFloor: number;
  refreshedAddresses: Set<string>;
  // Server-driven pagination + sorting: the parent owns this state and refetches.
  pageIndex: number;
  pageSize: number;
  rowCount: number;
  onPaginationChange: (pagination: PaginationState) => void;
  sorting: SortingState;
  onSortingChange: (sorting: SortingState) => void;
  sortOrder: DelegateSortOrder;
  onSortOrderChange: (order: DelegateSortOrder) => void;
  onSearchChange: (value: string) => void;
  onMinPowerChange: (value: string) => void;
  onVisibleRowsChange: (addresses: string[]) => void;
}

type DelegateWithSummary = DelegateInfo & Partial<TallyDelegateSummary>;

function getRowDelegateSummary(
  delegate: DelegateInfo
): TallyDelegateSummary | null {
  const row = delegate as DelegateWithSummary;
  if (!row.displayName && !row.name && !row.ens && !row.picture) return null;

  return {
    address: row.address,
    ens: row.ens ?? null,
    name: row.name ?? null,
    picture: row.picture ?? null,
    knownLabel: row.knownLabel ?? null,
    displayName:
      row.displayName ?? row.knownLabel ?? row.name ?? row.ens ?? null,
  };
}

export function DelegatesTable({
  delegates,
  totalVotingPower,
  isLoading,
  error,
  rpcHealthy,
  minPowerFloor,
  refreshedAddresses,
  pageIndex,
  pageSize,
  rowCount,
  onPaginationChange,
  sorting,
  onSortingChange,
  sortOrder,
  onSortOrderChange,
  onSearchChange,
  onMinPowerChange,
  onVisibleRowsChange,
}: DelegatesTableProps) {
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [searchValue, setSearchValue] = useState("");
  const [minPowerValue, setMinPowerValue] = useState(String(minPowerFloor));
  const [delegateSummaries, setDelegateSummaries] = useState<
    Map<string, TallyDelegateSummary>
  >(new Map());

  const rowDelegateSummaries = useMemo(() => {
    const summaries = new Map<string, TallyDelegateSummary>();
    for (const delegate of delegates) {
      const summary = getRowDelegateSummary(delegate);
      if (summary) summaries.set(delegate.address.toLowerCase(), summary);
    }
    return summaries;
  }, [delegates]);
  const tableDelegateSummaries = useMemo(
    () => new Map([...delegateSummaries, ...rowDelegateSummaries]),
    [rowDelegateSummaries, delegateSummaries]
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<DelegateInfo>({
    data: delegates,
    columns,
    state: {
      columnVisibility,
      rowSelection,
      columnFilters,
      sorting,
      pagination: { pageIndex, pageSize },
    },
    // Server-side pagination + sorting: `data` is already the current page,
    // `rowCount` is the whole-set total from the count endpoint, and ordering is
    // resolved by the indexer from the sorting/sortOrder state below.
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    rowCount,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex, pageSize })
          : updater;
      onPaginationChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    meta: {
      totalVotingPower,
      delegateSummaries: tableDelegateSummaries,
      refreshedAddresses,
      rowOffset: pageIndex * pageSize,
    },
  });

  const visibleRows = table.getRowModel().rows;
  const visibleAddressesKey = visibleRows
    .map((row) => row.original.address)
    .join(",");
  const hasActiveFilters =
    searchValue.length > 0 ||
    minPowerValue !== String(minPowerFloor) ||
    columnFilters.length > 0;
  const showTableShell =
    !isLoading && !error && (delegates.length > 0 || hasActiveFilters);

  // py-5 + h-7 avatar row ≈ 68px; header is 48px (h-12 in TableHead).
  const ROW_HEIGHT_PX = 68;
  const HEADER_HEIGHT_PX = 48;
  const minTableHeight = pageSize * ROW_HEIGHT_PX + HEADER_HEIGHT_PX;

  useEffect(() => {
    const visibleAddresses = visibleAddressesKey
      ? visibleAddressesKey.split(",")
      : [];
    onVisibleRowsChange(visibleAddresses);
  }, [visibleAddressesKey, onVisibleRowsChange]);

  useEffect(() => {
    const visibleAddresses = visibleAddressesKey
      ? visibleAddressesKey.split(",")
      : [];

    if (visibleAddresses.length === 0) {
      setDelegateSummaries((current) =>
        current.size === 0 ? current : new Map()
      );
      return;
    }

    let cancelled = false;
    getDelegateSummaries(visibleAddresses)
      .then((summaries) => {
        if (!cancelled) setDelegateSummaries(summaries);
      })
      .catch(() => {
        if (!cancelled) setDelegateSummaries(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [visibleAddressesKey]);

  return (
    <section id="delegates-table">
      <RpcUnhealthyMessage show={rpcHealthy === false} />
      <LoadingState show={isLoading} />
      <ErrorMessage error={error} />

      {showTableShell && (
        <div className="space-y-4 overflow-hidden">
          <DelegatesToolbar
            table={table}
            minPowerFloor={minPowerFloor}
            searchValue={searchValue}
            minPowerValue={minPowerValue}
            onSearchChange={(value) => {
              setSearchValue(value);
              onSearchChange(value);
            }}
            onMinPowerChange={(value) => {
              setMinPowerValue(value);
              onMinPowerChange(value);
            }}
            sortOrder={sortOrder}
            onSortOrderChange={onSortOrderChange}
          />

          <div className="relative">
            <div
              className="glass rounded-2xl overflow-x-auto scrollbar-thin"
              style={{ minHeight: minTableHeight }}
            >
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
                        style={{ height: ROW_HEIGHT_PX }}
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
        show={!showTableShell && delegates.length === 0 && !isLoading && !error}
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
