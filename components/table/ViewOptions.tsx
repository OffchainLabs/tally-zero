"use client";

import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import { MixerHorizontalIcon } from "@radix-ui/react-icons";
import { Table } from "@tanstack/react-table";

import { Button } from "@components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@components/ui/DropdownMenu";

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
}

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    label?: string;
  }
}

function formatColumnLabel(id: string) {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function DataTableViewOptions<TData>({
  table,
}: DataTableViewOptionsProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="glass"
          size="sm"
          className="ml-auto hidden h-12 lg:flex glass-subtle backdrop-blur hover:bg-white/20 dark:hover:bg-white/10 transition-all duration-200"
        >
          <MixerHorizontalIcon className="mr-2 h-4 w-4" />
          View
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[150px] glass-subtle backdrop-blur rounded-lg"
      >
        <DropdownMenuLabel className="text-foreground/80">
          Toggle columns
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/20 dark:bg-white/10" />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide()
          )
          .map((column) => {
            const label =
              column.columnDef.meta?.label ?? formatColumnLabel(column.id);

            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="hover:bg-white/20 dark:hover:bg-white/10 transition-all duration-200"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {label}
              </DropdownMenuCheckboxItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
