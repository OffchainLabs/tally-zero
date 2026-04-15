"use client";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useDelegateLookup } from "@/hooks/use-delegate-lookup";
import { isValidAddress } from "@/lib/address-utils";
import { formatVotingPower, shortenAddress } from "@/lib/format-utils";
import {
  ExternalLinkIcon,
  MagnifyingGlassIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import { useState } from "react";

interface DelegateLookupProps {
  defaultAddress?: string;
}

export function DelegateLookup({ defaultAddress = "" }: DelegateLookupProps) {
  const [addressInput, setAddressInput] = useState(defaultAddress);
  const [activeAddress, setActiveAddress] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { result, isLoading, error, refetch } = useDelegateLookup({
    address: activeAddress,
    enabled: activeAddress.length > 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValidAddress(addressInput)) {
      setActiveAddress(addressInput);
    }
  };

  const handleClear = () => {
    setAddressInput("");
    setActiveAddress("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <MagnifyingGlassIcon className="mr-2 h-4 w-4" />
          Delegate Lookup
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Delegate Lookup</DialogTitle>
          <DialogDescription>
            Look up any address to see their voting power and delegation status.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delegateAddress">Address</Label>
            <div className="flex gap-2">
              <Input
                id="delegateAddress"
                type="text"
                placeholder="0x..."
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                className="font-mono text-sm"
              />
              <Button type="submit" disabled={isLoading || !addressInput}>
                {isLoading ? (
                  <ReloadIcon className="h-4 w-4 animate-spin" />
                ) : (
                  "Look Up"
                )}
              </Button>
              {activeAddress && (
                <Button type="button" variant="outline" onClick={handleClear}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </form>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {result && (
          <DelegateInfoCard
            result={result}
            isLoading={isLoading}
            onRefresh={refetch}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface DelegateInfoCardProps {
  result: {
    address: string;
    votingPower: string;
    delegatedTo: string;
    isSelfDelegated: boolean;
    label?: string;
    cacheRank?: number;
    cacheVotingPower?: string;
  };
  isLoading: boolean;
  onRefresh: () => void;
}

function DelegateInfoCard({
  result,
  isLoading,
  onRefresh,
}: DelegateInfoCardProps) {
  const arbiscanUrl = `https://arbiscan.io/address/${result.address}`;
  const delegateArbiscanUrl = `https://arbiscan.io/address/${result.delegatedTo}`;
  const hasVotingPower = BigInt(result.votingPower) > BigInt(0);

  // Calculate if voting power has changed since cache
  let votingPowerChange: "up" | "down" | "same" | null = null;
  if (result.cacheVotingPower) {
    const current = BigInt(result.votingPower);
    const cached = BigInt(result.cacheVotingPower);
    if (current > cached) votingPowerChange = "up";
    else if (current < cached) votingPowerChange = "down";
    else votingPowerChange = "same";
  }

  return (
    <div className="glass-subtle backdrop-blur rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Delegate Info</h4>
        <div className="flex items-center gap-2">
          <a
            href={arbiscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            View on Arbiscan
            <ExternalLinkIcon className="h-3 w-3" />
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <ReloadIcon className="h-4 w-4 animate-spin" />
            ) : (
              <ReloadIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {/* Address */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Address</span>
          <div className="flex items-center gap-2">
            {result.label && (
              <span className="text-xs font-medium text-primary">
                {result.label}
              </span>
            )}
            <span className="font-mono text-sm" title={result.address}>
              {shortenAddress(result.address, 6)}
            </span>
          </div>
        </div>

        {/* Voting Power */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Voting Power</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              {formatVotingPower(result.votingPower)} ARB
            </span>
            {votingPowerChange === "up" && (
              <span className="text-xs text-green-500">+</span>
            )}
            {votingPowerChange === "down" && (
              <span className="text-xs text-red-500">-</span>
            )}
          </div>
        </div>

        {/* Cache Rank (if in cache) */}
        {result.cacheRank && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Cache Rank</span>
            <span className="text-sm">#{result.cacheRank}</span>
          </div>
        )}

        {/* Delegation Status */}
        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Delegation</span>
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                result.isSelfDelegated
                  ? "bg-primary/10 text-primary"
                  : "bg-yellow-500/10 text-yellow-600"
              }`}
            >
              {result.isSelfDelegated
                ? "Self-delegated"
                : "Delegating to another"}
            </span>
          </div>

          {!result.isSelfDelegated && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Delegated To
              </span>
              <a
                href={delegateArbiscanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-primary hover:underline flex items-center gap-1"
                title={result.delegatedTo}
              >
                {shortenAddress(result.delegatedTo, 6)}
                <ExternalLinkIcon className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>

        {/* Status indicators */}
        <div className="pt-2 border-t border-border/50 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${hasVotingPower ? "bg-green-500" : "bg-gray-400"}`}
            />
            <span className="text-muted-foreground">
              {hasVotingPower ? "Has voting power" : "No voting power"}
            </span>
          </div>
          {result.cacheRank ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-muted-foreground">
                In delegate cache (rank #{result.cacheRank})
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-muted-foreground">
                Not in delegate cache
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
