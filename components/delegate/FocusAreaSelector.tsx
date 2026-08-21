"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { addFocusArea, MAX_FOCUS_AREAS } from "@/lib/delegate-registration";

interface FocusAreaSelectorProps {
  value: string[];
  onChange: (focusAreas: string[]) => void;
  disabled?: boolean;
}

export function FocusAreaSelector({
  value,
  onChange,
  disabled,
}: FocusAreaSelectorProps) {
  const [draft, setDraft] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const atCapacity = value.length >= MAX_FOCUS_AREAS;

  function commitDraft() {
    onChange(addFocusArea(value, draft));
    setDraft("");
    setIsAdding(false);
  }

  return (
    <div className="space-y-3" data-testid="focus-areas">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Focus Areas</h3>
          <p className="text-sm text-muted-foreground">
            Choose up to {MAX_FOCUS_AREAS}. Potential delegators can filter
            based on these items on the explore page.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={disabled || atCapacity || isAdding}
          onClick={() => setIsAdding(true)}
          data-testid="focus-area-add"
        >
          Add focus area
          <Plus className="ml-1 h-4 w-4" />
        </Button>
      </div>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((area) => (
            <li key={area}>
              <Badge variant="glass" className="gap-1.5 pr-1.5">
                {area}
                <button
                  type="button"
                  aria-label={`Remove ${area}`}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((a) => a !== area))}
                  className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {isAdding && (
        <div className="flex gap-2">
          <Input
            autoFocus
            variant="glass"
            value={draft}
            disabled={disabled}
            placeholder="e.g. Treasury, Security, Grants"
            data-testid="focus-area-input"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
              if (e.key === "Escape") {
                setDraft("");
                setIsAdding(false);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled || draft.trim() === ""}
            onClick={commitDraft}
          >
            Add
          </Button>
        </div>
      )}

      {atCapacity && (
        <p className="text-xs text-muted-foreground">
          You have selected the maximum of {MAX_FOCUS_AREAS} focus areas.
        </p>
      )}
    </div>
  );
}
