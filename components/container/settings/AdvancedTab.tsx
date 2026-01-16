"use client";

import { AlertTriangle, Trash2 } from "lucide-react";

import { DelegateLookup } from "@/components/container/DelegateLookup";
import { TimelockOperationTracker } from "@/components/container/TimelockOperationTracker";
import { Button } from "@/components/ui/Button";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { CACHE_TTL_OPTIONS } from "@/config/storage-keys";

import { BackupRestoreSection } from "./BackupRestoreSection";
import { CacheManagementSection } from "./CacheManagementSection";
import { DebugInfoSection } from "./DebugInfoSection";
import { DebugLoggingToggle } from "./DebugLoggingToggle";
import { formatTtl } from "./settings-utils";
import { SettingsToggle } from "./SettingsToggle";
import { TenderlyConfigSection } from "./TenderlyConfigSection";
import type { StoredSettings } from "./types";

interface AdvancedTabProps {
  // TTL settings
  ttlInput: number;
  setTtlInput: (value: number) => void;
  ttlCustomInput: string;
  setTtlCustomInput: (value: string) => void;
  // Skip bundled cache
  skipBundledCache: boolean;
  setSkipBundledCache: (value: boolean) => void;
  // Tenderly settings
  tenderlyOrgInput: string;
  setTenderlyOrgInput: (value: string) => void;
  tenderlyProjectInput: string;
  setTenderlyProjectInput: (value: string) => void;
  tenderlyAccessTokenInput: string;
  setTenderlyAccessTokenInput: (value: string) => void;
  // Actions
  onClearCache: () => void;
  onExportSettings: () => void;
  onImportSettings: () => void;
  onResetDefaults: () => void;
  onClearAllSettings: () => void;
  // Stats
  cacheStats: { count: number; size: string };
  totalStorage: string;
  // Nerd mode
  nerdMode: boolean;
  storedSettings: StoredSettings;
}

/**
 * Advanced settings tab with cache, Tenderly config, and danger zone
 */
export function AdvancedTab({
  ttlInput,
  setTtlInput,
  ttlCustomInput,
  setTtlCustomInput,
  skipBundledCache,
  setSkipBundledCache,
  tenderlyOrgInput,
  setTenderlyOrgInput,
  tenderlyProjectInput,
  setTenderlyProjectInput,
  tenderlyAccessTokenInput,
  setTenderlyAccessTokenInput,
  onClearCache,
  onExportSettings,
  onImportSettings,
  onResetDefaults,
  onClearAllSettings,
  cacheStats,
  totalStorage,
  nerdMode,
  storedSettings,
}: AdvancedTabProps) {
  return (
    <div className="mt-0 space-y-6">
      {/* Cache Duration */}
      <div className="glass-subtle rounded-lg p-4 space-y-3 transition-all duration-200 hover:shadow-md">
        <Label className="text-sm font-medium">Cache Duration</Label>
        <div className="grid grid-cols-3 gap-2">
          {CACHE_TTL_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={ttlInput === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTtlInput(option.value);
                setTtlCustomInput(String(option.value));
              }}
              className="transition-all duration-200"
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={ttlCustomInput}
            onChange={(e) => {
              setTtlCustomInput(e.target.value);
              const parsed = parseInt(e.target.value);
              if (!isNaN(parsed) && parsed > 0) {
                setTtlInput(parsed);
              }
            }}
            placeholder="3600"
            min={1}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            seconds
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          How long to cache proposal lifecycle data before auto-refresh
          (current: {formatTtl(ttlInput)})
        </p>
      </div>

      {/* Skip Bundled Cache */}
      <SettingsToggle
        label="Skip Bundled Cache"
        description="Bypass bundled stage checkpoints and discover fresh data via RPC"
        enabled={skipBundledCache}
        onToggle={() => setSkipBundledCache(!skipBundledCache)}
      />

      {/* Tenderly Configuration */}
      <TenderlyConfigSection
        tenderlyOrgInput={tenderlyOrgInput}
        setTenderlyOrgInput={setTenderlyOrgInput}
        tenderlyProjectInput={tenderlyProjectInput}
        setTenderlyProjectInput={setTenderlyProjectInput}
        tenderlyAccessTokenInput={tenderlyAccessTokenInput}
        setTenderlyAccessTokenInput={setTenderlyAccessTokenInput}
      />

      {/* Cache Management */}
      <CacheManagementSection
        cacheStats={cacheStats}
        totalStorage={totalStorage}
        onClearCache={onClearCache}
      />

      {/* Backup & Restore */}
      <BackupRestoreSection
        onExportSettings={onExportSettings}
        onImportSettings={onImportSettings}
      />

      {/* Danger Zone */}
      <div className="glass-subtle rounded-lg p-4 transition-all duration-200 hover:shadow-md">
        <CollapsibleSection
          title="Danger Zone"
          icon={<AlertTriangle className="w-4 h-4" />}
          variant="destructive"
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-destructive">
                Reset to Defaults
              </Label>
              <p className="text-xs text-muted-foreground">
                Reset form inputs to default values (does not save)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full transition-all duration-200"
                onClick={onResetDefaults}
              >
                Reset Form to Defaults
              </Button>
            </div>

            <div className="pt-3 border-t border-[var(--glass-border)] space-y-2">
              <Label className="text-sm font-medium text-destructive">
                Factory Reset
              </Label>
              <p className="text-xs text-muted-foreground">
                Clear ALL settings and cache. This cannot be undone.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full transition-all duration-200"
                onClick={onClearAllSettings}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All Settings
              </Button>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      {/* Debug Logging Toggle (Nerd Mode Only) */}
      {nerdMode && <DebugLoggingToggle />}

      {/* Nerd Mode Tools */}
      {nerdMode && (
        <div className="glass-subtle rounded-lg p-4 space-y-4 transition-all duration-200 hover:shadow-md">
          <Label className="text-sm font-medium">Governance Tools</Label>
          <div className="space-y-4">
            {/* Delegate Lookup */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Look up any address to see their voting power and delegation
                status in real-time.
              </p>
              <DelegateLookup />
            </div>

            {/* Timelock Operation Tracker */}
            <div className="space-y-2 pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Track arbitrary timelock operations (e.g., Security Council
                actions) by providing a transaction hash containing a
                CallScheduled event.
              </p>
              <TimelockOperationTracker />
            </div>
          </div>
        </div>
      )}

      {/* Debug Info (Nerd Mode Only) */}
      {nerdMode && <DebugInfoSection storedSettings={storedSettings} />}
    </div>
  );
}
