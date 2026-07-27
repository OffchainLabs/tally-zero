import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { Table } from "@tanstack/react-table";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { Button } from "@components/ui/Button";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

/**
 * Build the page-number list with ellipses: always the first and last page,
 * plus the current page and its immediate neighbours (e.g. 1 … 4 5 6 … 20).
 */
function buildPageItems(
  current: number,
  total: number
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: (number | "ellipsis")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) items.push("ellipsis");
  for (let page = left; page <= right; page++) items.push(page);
  if (right < total - 1) items.push("ellipsis");
  items.push(total);

  return items;
}

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const pageCount = Math.max(table.getPageCount(), 1);
  const { pageIndex, pageSize } = table.getState().pagination;
  const currentPage = pageIndex + 1;

  const total = table.getFilteredRowModel().rows.length;
  const start = total === 0 ? 0 : pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, total);

  const items = buildPageItems(currentPage, pageCount);

  return (
    <div className="grid grid-cols-1 items-center gap-3 px-2 sm:grid-cols-3">
      {/* Left: result summary */}
      <p className="order-2 text-sm text-muted-foreground text-center sm:order-1 sm:text-left">
        Showing {start} to {end} of {total} results
      </p>

      {/* Center: numbered pagination */}
      <div className="order-1 flex items-center justify-center gap-1 sm:order-2">
        <Button
          variant="ghost"
          className="h-8 w-8 p-0 hover:bg-white/10"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <span className="sr-only">Go to previous page</span>
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>

        {items.map((item, index) =>
          item === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="px-1 text-sm text-muted-foreground"
            >
              &hellip;
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === currentPage ? "page" : undefined}
              onClick={() => table.setPageIndex(item - 1)}
              className={cn(
                "h-8 min-w-8 rounded-md px-2 text-sm font-medium tabular-nums transition-colors",
                item === currentPage
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
              )}
            >
              {item}
            </button>
          )
        )}

        <Button
          variant="ghost"
          className="h-8 w-8 p-0 hover:bg-white/10"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <span className="sr-only">Go to next page</span>
          <ChevronRightIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Right: rows-per-page select */}
      <div className="order-3 flex items-center justify-center gap-2 sm:justify-end">
        <p className="text-sm font-medium text-muted-foreground">Rows</p>
        <Select
          value={`${pageSize}`}
          onValueChange={(value) => table.setPageSize(Number(value))}
        >
          <SelectTrigger className="h-8 w-[70px] glass-subtle backdrop-blur hover:bg-white/10 transition-colors">
            <SelectValue placeholder={pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem
                key={size}
                value={`${size}`}
                className="hover:bg-white/10 rounded-md transition-colors"
              >
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
