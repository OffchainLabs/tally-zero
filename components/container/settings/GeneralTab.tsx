"use client";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";

import { SettingsToggle } from "./SettingsToggle";

interface GeneralTabProps {
  theme: string | undefined;
  setTheme: (theme: string) => void;
  daysInput: string;
  setDaysInput: (value: string) => void;
  nerdMode: boolean;
  toggleNerdMode: () => void;
}

/**
 * General settings tab with theme, days to search, and nerd mode
 */
export function GeneralTab({
  theme,
  setTheme,
  daysInput,
  setDaysInput,
  nerdMode,
  toggleNerdMode,
}: GeneralTabProps) {
  return (
    <div className="mt-0 space-y-6">
      <div className="glass-subtle backdrop-blur rounded-lg p-4 space-y-3 transition-all duration-200 hover:shadow-md">
        <Label className="text-sm font-medium">Theme</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["light", "dark", "system"] as const).map((t) => (
            <Button
              key={t}
              type="button"
              variant={theme === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTheme(t)}
              className="capitalize transition-all duration-200"
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      <div className="glass-subtle backdrop-blur rounded-lg p-4 space-y-2 transition-all duration-200 hover:shadow-md">
        <Label htmlFor="days-search">Days to Search</Label>
        <Input
          id="days-search"
          type="number"
          value={daysInput}
          onChange={(e) => setDaysInput(e.target.value)}
          placeholder={String(DEFAULT_FORM_VALUES.daysToSearch)}
          min={1}
          max={365}
        />
        <p className="text-xs text-muted-foreground">
          How many days back to search for proposals (1-365)
        </p>
      </div>

      <SettingsToggle
        label="Nerd Mode"
        description="Show technical details and debug info"
        enabled={nerdMode}
        onToggle={toggleNerdMode}
      />
    </div>
  );
}
