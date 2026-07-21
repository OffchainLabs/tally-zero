import { Skeleton } from "@components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@components/ui/Table";

const DESKTOP_ROWS = 8;
const MOBILE_CARDS = 5;

/**
 * Skeleton mirroring the proposals DataTable layout: toolbar, glass table
 * with the real column headers on desktop, stacked cards on mobile.
 * Column visibility matches DataTable's breakpoint map (governor: md,
 * votes: lg); the table itself only renders at sm+ like the real one.
 */
export default function SearchSkeleton() {
  return (
    <div className="space-y-4">
      {/* Toolbar: search input + New Proposal button */}
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-10 w-full sm:w-[150px] lg:w-[450px]" />
        <Skeleton className="h-9 w-[130px]" />
      </div>

      {/* Mobile: stacked proposal cards */}
      <div className="space-y-3 sm:hidden">
        {Array.from({ length: MOBILE_CARDS }, (_, i) => (
          <div
            key={i}
            className="w-full p-4 rounded-xl min-h-[88px] glass-subtle backdrop-blur"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex items-center gap-2 mt-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: glass table */}
      <div className="hidden sm:block relative overflow-x-auto">
        <div className="glass rounded-2xl overflow-clip">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: 500 }}>Proposal</TableHead>
                <TableHead
                  className="hidden md:table-cell"
                  style={{ width: 90 }}
                >
                  Governor
                </TableHead>
                <TableHead style={{ width: 100 }}>Status</TableHead>
                <TableHead
                  className="hidden lg:table-cell"
                  style={{ width: 180 }}
                >
                  Votes
                </TableHead>
                <TableHead style={{ width: 100 }}>Your Vote</TableHead>
                <TableHead style={{ width: 100 }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: DESKTOP_ROWS }, (_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="min-w-[300px] lg:min-w-[400px] xl:min-w-[500px] space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Skeleton className="h-2.5 w-28 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="hidden sm:flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
      </div>
    </div>
  );
}
