"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import {
  type MyDelegatorRecord,
  useMyDelegators,
} from "@/hooks/use-my-delegators";
import { useAddressDisplayRecord } from "@/lib/delegate-cache";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";

interface MyDelegatorsListProps {
  delegateAddress: string | undefined;
}

export function MyDelegatorsList({ delegateAddress }: MyDelegatorsListProps) {
  const { data, isPending, isError, error, refetch, isFetching } =
    useMyDelegators(delegateAddress);

  const count = data?.length ?? 0;

  return (
    <Card variant="glass" className="md:col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" />
          Delegators{data && ` (${count})`}
        </CardTitle>
        <CardDescription>
          Addresses currently delegating their ARB voting power to you. Their
          balances combine to form your voting power.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!delegateAddress && (
          <p className="text-sm text-muted-foreground">
            Connect a wallet to see your delegators.
          </p>
        )}

        {delegateAddress && isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ReloadIcon className="h-4 w-4 animate-spin" />
            Scanning DelegateChanged events. This can take a little while for
            addresses with long histories.
          </div>
        )}

        {delegateAddress && isError && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              Failed to load delegators: {error?.message ?? "Unknown error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching && (
                <ReloadIcon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Retry
            </Button>
          </div>
        )}

        {delegateAddress && data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No one is currently delegating to you.
          </p>
        )}

        {delegateAddress && data && data.length > 0 && (
          <ul className="divide-y divide-border/40">
            {data.map((record) => (
              <DelegatorRow key={record.address} record={record} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DelegatorRow({ record }: { record: MyDelegatorRecord }) {
  const display = useAddressDisplayRecord(record.address);
  const label = display?.label;

  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="flex min-w-0 flex-col">
        <Link
          href={`/delegates/${record.address.toLowerCase()}`}
          className="truncate text-primary hover:underline"
        >
          {label || shortenAddress(record.address, 6)}
        </Link>
        {label && (
          <span
            className="truncate font-mono text-xs text-muted-foreground"
            title={record.address}
          >
            {shortenAddress(record.address, 6)}
          </span>
        )}
      </div>
      <span className="whitespace-nowrap text-sm font-medium">
        {formatVotingPower(record.balance)} ARB
      </span>
    </li>
  );
}
