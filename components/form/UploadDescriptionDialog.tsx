"use client";

import { ReloadIcon } from "@radix-ui/react-icons";
import { useEffect, useState } from "react";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/RadioGroup";

import {
  detectSourceFromUrl,
  importProposalDescription,
  type ProposalImportResult,
  type ProposalImportSource,
} from "@/lib/proposal-import";
import { cn } from "@/lib/utils";

interface UploadDescriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (result: ProposalImportResult) => void;
  hasExistingContent: boolean;
}

const PLACEHOLDERS: Record<ProposalImportSource, string> = {
  forum: "https://forum.arbitrum.foundation/t/<slug>/<id>",
  snapshot: "https://snapshot.box/#/s:<space>/proposal/<id>",
};

const SOURCE_OPTIONS: Record<
  ProposalImportSource,
  { title: string; hint: string }
> = {
  forum: {
    title: "Arbitrum forum",
    hint: "Imports the first post of a Discourse topic as markdown.",
  },
  snapshot: {
    title: "Snapshot",
    hint: "Imports the proposal title and body from Snapshot.",
  },
};

export function UploadDescriptionDialog({
  open,
  onOpenChange,
  onImport,
  hasExistingContent,
}: UploadDescriptionDialogProps) {
  const [source, setSource] = useState<ProposalImportSource>("forum");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSource("forum");
      setUrl("");
      setBusy(false);
      setErrorMessage(null);
    }
  }, [open]);

  async function handleImport() {
    if (!url.trim()) {
      setErrorMessage("Paste a URL first.");
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await importProposalDescription(source, url);
      onImport(result);
      onOpenChange(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import description</DialogTitle>
          <DialogDescription>
            Paste a link from the Arbitrum governance forum or Snapshot. The
            fetched content replaces the description textarea.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup
            value={source}
            onValueChange={(value) => {
              setSource(value as ProposalImportSource);
              setErrorMessage(null);
            }}
            className="grid gap-3 sm:grid-cols-2"
            disabled={busy}
          >
            {(Object.keys(SOURCE_OPTIONS) as ProposalImportSource[]).map(
              (key) => {
                const selected = source === key;
                const option = SOURCE_OPTIONS[key];
                return (
                  <label
                    key={key}
                    htmlFor={`import-source-${key}`}
                    className={cn(
                      "flex gap-3 rounded-xl border p-3 cursor-pointer transition-all",
                      "glass-subtle backdrop-blur hover:border-primary/50",
                      selected
                        ? "border-primary/70 ring-1 ring-primary/40"
                        : "border-border/40"
                    )}
                  >
                    <RadioGroupItem
                      value={key}
                      id={`import-source-${key}`}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {option.title}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {option.hint}
                      </p>
                    </div>
                  </label>
                );
              }
            )}
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="import-url" className="text-xs">
              URL
            </Label>
            <Input
              id="import-url"
              value={url}
              onChange={(e) => {
                const next = e.target.value;
                setUrl(next);
                setErrorMessage(null);
                const detected = detectSourceFromUrl(next);
                if (detected) setSource(detected);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) {
                  e.preventDefault();
                  handleImport();
                }
              }}
              placeholder={PLACEHOLDERS[source]}
              variant="glass"
              disabled={busy}
              className="font-mono text-xs"
            />
          </div>

          {hasExistingContent && !errorMessage && (
            <p className="text-xs text-amber-600">
              This will replace your current description.
            </p>
          )}

          {errorMessage && (
            <p className="text-xs text-red-400">{errorMessage}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={busy || !url.trim()}>
            {busy ? (
              <>
                <ReloadIcon className="h-4 w-4 mr-2 animate-spin" />
                Importing
              </>
            ) : (
              "Import"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
