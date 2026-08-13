"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useActAs } from "@/hooks/use-act-as";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Enter a Safe address to act as.
 *
 * This is the primary way in, not a fallback: the indexer's Safe list only
 * contains Safes you have already acted as, so it is empty for every new user
 * and a picker alone would be a dead end.
 */
export function ActAsByAddressDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { actAs, isStarting, startError, resetStartError } = useActAs();
  const [input, setInput] = useState("");

  const address = input.trim();
  const isValid = ADDRESS_RE.test(address);

  function setOpen(next: boolean) {
    if (next) {
      setInput("");
      resetStartError();
    }
    onOpenChange(next);
  }

  async function submit() {
    if (!isValid || isStarting) return;
    try {
      await actAs(address);
      onOpenChange(false);
    } catch {
      // Stay open so the indexer's reason (not a Safe / not an owner) is
      // readable next to the address that caused it; startError renders it.
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Act as a Safe</DialogTitle>
          <DialogDescription>
            Enter a Safe you own. Ownership is verified on chain, and while
            acting as it your profile, drafts, and uploads all belong to the
            Safe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="act-as-address">Safe address</Label>
          <Input
            id="act-as-address"
            data-testid="act-as-safe-input"
            autoComplete="off"
            spellCheck={false}
            placeholder="0x…"
            className="font-mono"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              resetStartError();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          {startError ? (
            <p className="text-sm text-destructive" data-testid="act-as-error">
              {startError.message}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isStarting}
          >
            Cancel
          </Button>
          <Button
            data-testid="act-as-submit"
            onClick={submit}
            disabled={isStarting || !isValid}
          >
            {isStarting ? "Verifying…" : "Act as Safe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
