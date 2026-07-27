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
 * Skeleton mirroring the proposals table below the tabs header: the search
 * toolbar, the glass table with the real column headers on desktop (including
 * the Quorum column), stacked cards on mobile, and the paginated footer.
 * Column visibility matches DataTable's breakpoint map (governor: md, votes: lg,
 * quorum: xl); the table itself only renders at sm+ like the real one.
 */
export default function SearchSkeleton() {
  return (
    <div className="space-y-4">
      {/* Toolbar: search input */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 w-full sm:w-[280px] rounded-md" />
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
                  style={{ width: 120 }}
                >
                  Votes
                </TableHead>
                <TableHead
                  className="hidden xl:table-cell"
                  style={{ width: 120 }}
                >
                  Quorum
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
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Skeleton className="h-2 w-2 rounded-full" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="w-24 space-y-1">
                      <Skeleton className="h-1.5 w-24 rounded-full" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="w-24 space-y-1">
                      <Skeleton className="h-1.5 w-24 rounded-full" />
                      <Skeleton className="h-2.5 w-8" />
                    </div>
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
      <div className="hidden sm:grid grid-cols-3 items-center gap-3 px-2">
        <Skeleton className="h-4 w-44" />
        <div className="flex items-center justify-center gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-8 rounded-md" />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-8 w-[70px] rounded-md" />
        </div>
      </div>
    </div>
  );
}
