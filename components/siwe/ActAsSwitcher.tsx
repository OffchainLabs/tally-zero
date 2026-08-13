"use client";

import { ChevronDown, Plus, Shield } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { useActAs, useSafes } from "@/hooks/use-act-as";
import { useSiwe } from "@/hooks/use-siwe";
import { shortenAddress } from "@/lib/format-utils";

import { ActAsByAddressDialog } from "./ActAsByAddressDialog";

/**
 * Switch the session's effective subject to a Safe the signer owns.
 *
 * Lists Safes already proven owned, and always offers the by-address path —
 * see ActAsByAddressDialog for why that is the primary entry rather than a
 * fallback.
 */
export function ActAsSwitcher() {
  const { isSignedIn, session, actingAs } = useSiwe();
  const { data: safes = [], isLoading } = useSafes();
  const { actAs, stopActingAs } = useActAs();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!isSignedIn) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-testid="act-as-trigger"
            className="gap-1.5"
          >
            <Shield className="h-3.5 w-3.5" />
            {actingAs ? shortenAddress(actingAs) : "Act as Safe"}
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {actingAs ? "Acting as" : "Signed in as"}
          </DropdownMenuLabel>

          {!actingAs && session?.address ? (
            <DropdownMenuItem disabled className="opacity-100">
              <span className="font-mono text-xs">
                {shortenAddress(session.address)}
              </span>
            </DropdownMenuItem>
          ) : null}

          {safes.length > 0 ? <DropdownMenuSeparator /> : null}

          {safes.map((safe) => (
            <DropdownMenuItem
              key={safe.address}
              data-testid="act-as-safe-option"
              disabled={safe.address.toLowerCase() === actingAs?.toLowerCase()}
              onSelect={() => {
                actAs(safe.address).catch(() => {});
              }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-xs">
                  {shortenAddress(safe.address)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {safe.owners.length} owner
                  {safe.owners.length === 1 ? "" : "s"} · threshold{" "}
                  {safe.threshold}
                </span>
              </div>
            </DropdownMenuItem>
          ))}

          {isLoading ? (
            <DropdownMenuItem disabled>
              <span className="text-xs text-muted-foreground">
                Loading Safes…
              </span>
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            data-testid="act-as-by-address"
            onSelect={(event) => {
              // Keep the menu's close from unmounting the dialog.
              event.preventDefault();
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            <span className="text-sm">Act as a Safe by address…</span>
          </DropdownMenuItem>

          {actingAs ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="act-as-stop-menu"
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  stopActingAs().catch(() => {});
                }}
              >
                Stop acting as Safe
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ActAsByAddressDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
