"use client";

import { Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/Sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";

import { useNerdMode } from "@/context/NerdModeContext";
import { useSettingsSheet } from "@/context/SettingsSheetContext";
import { useSettingsForm } from "@/hooks/use-settings-form";

import {
  AdvancedTab,
  GeneralTab,
  RpcTab,
  clearAllSettings,
  clearCache,
  exportSettings,
  getCacheStats,
  getTotalStorageUsage,
  importSettings,
} from "./settings";

export function SettingsSheet() {
  const searchParams = useSearchParams();
  const isDevMode = Array.from(searchParams.entries()).some(
    ([key, value]) => key.toLowerCase() === "devmode" && value === "true"
  );

  const { theme, setTheme } = useTheme();
  const { isOpen, activeTab, openSettings, closeSettings, setActiveTab } =
    useSettingsSheet();
  const { nerdMode, toggleNerdMode } = useNerdMode();

  // Form state management via custom hook
  const {
    formState,
    setFormState,
    storedSettings,
    storeSetters,
    syncFromStorage,
    resetToDefaults,
    saveToStorage,
  } = useSettingsForm();

  // Counter to trigger cache stats refresh
  const [cacheRefreshKey, setCacheRefreshKey] = useState(0);

  // Sync local state when sheet opens
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        syncFromStorage();
        openSettings();
      } else {
        closeSettings();
      }
    },
    [syncFromStorage, openSettings, closeSettings]
  );

  // Save settings
  const handleSave = useCallback(() => {
    saveToStorage();
    closeSettings();
    window.location.reload();
  }, [saveToStorage, closeSettings]);

  // Action handlers
  const handleClearCache = useCallback(() => {
    const count = clearCache();
    setCacheRefreshKey((k) => k + 1);
    alert(`Cleared ${count} cached items`);
  }, []);

  const handleSkipBundledCacheToggle = useCallback(
    (value: boolean) => {
      storeSetters.setSkipBundledCache(value);
      const count = clearCache();
      setCacheRefreshKey((k) => k + 1);
      if (count > 0) {
        alert(
          `Skip Bundled Cache ${value ? "enabled" : "disabled"}. Cleared ${count} cached items.`
        );
      }
    },
    [storeSetters]
  );

  const handleClearAllSettings = useCallback(() => {
    if (
      !confirm(
        "Are you sure? This will reset ALL settings to defaults and clear all cache."
      )
    ) {
      return;
    }
    clearAllSettings();
    alert("All settings have been reset. The page will reload.");
    window.location.reload();
  }, []);

  const handleExportSettings = useCallback(() => {
    const settings = exportSettings();
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tally-zero-settings-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportSettings = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const settings = JSON.parse(event.target?.result as string);
          importSettings(settings);
          alert("Settings imported successfully. The page will reload.");
          window.location.reload();
        } catch {
          alert("Failed to import settings. Invalid file format.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cacheStats = useMemo(() => getCacheStats(), [cacheRefreshKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const totalStorage = useMemo(() => getTotalStorageUsage(), [cacheRefreshKey]);

  if (!isDevMode) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col overflow-hidden border-l-[var(--glass-border)]"
      >
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure TallyZero preferences and RPC endpoints
          </SheetDescription>
        </SheetHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as "general" | "rpc" | "advanced")
          }
          className="flex-1 flex flex-col mt-4 min-h-0"
        >
          <TabsList className="flex-shrink-0 w-full grid grid-cols-3">
            <TabsTrigger value="general" className="text-xs sm:text-sm">
              General
            </TabsTrigger>
            <TabsTrigger value="rpc" className="text-xs sm:text-sm">
              RPC
            </TabsTrigger>
            <TabsTrigger value="advanced" className="text-xs sm:text-sm">
              Advanced
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 pr-1">
            <TabsContent value="general">
              <GeneralTab
                theme={theme}
                setTheme={setTheme}
                daysInput={formState.daysInput}
                setDaysInput={setFormState.setDaysInput}
                nerdMode={nerdMode}
                toggleNerdMode={toggleNerdMode}
              />
            </TabsContent>

            <TabsContent value="rpc">
              <RpcTab
                l2RpcInput={formState.l2RpcInput}
                setL2RpcInput={setFormState.setL2RpcInput}
                l1RpcInput={formState.l1RpcInput}
                setL1RpcInput={setFormState.setL1RpcInput}
                blockRangeInput={formState.blockRangeInput}
                setBlockRangeInput={setFormState.setBlockRangeInput}
                l1BlockRangeInput={formState.l1BlockRangeInput}
                setL1BlockRangeInput={setFormState.setL1BlockRangeInput}
              />
            </TabsContent>

            <TabsContent value="advanced">
              <AdvancedTab
                ttlInput={formState.ttlInput}
                setTtlInput={setFormState.setTtlInput}
                ttlCustomInput={formState.ttlCustomInput}
                setTtlCustomInput={setFormState.setTtlCustomInput}
                skipBundledCache={storedSettings.skipBundledCache}
                setSkipBundledCache={handleSkipBundledCacheToggle}
                tenderlyOrgInput={formState.tenderlyOrgInput}
                setTenderlyOrgInput={setFormState.setTenderlyOrgInput}
                tenderlyProjectInput={formState.tenderlyProjectInput}
                setTenderlyProjectInput={setFormState.setTenderlyProjectInput}
                tenderlyAccessTokenInput={formState.tenderlyAccessTokenInput}
                setTenderlyAccessTokenInput={
                  setFormState.setTenderlyAccessTokenInput
                }
                onClearCache={handleClearCache}
                onExportSettings={handleExportSettings}
                onImportSettings={handleImportSettings}
                onResetDefaults={resetToDefaults}
                onClearAllSettings={handleClearAllSettings}
                cacheStats={cacheStats}
                totalStorage={totalStorage}
                nerdMode={nerdMode}
                storedSettings={storedSettings}
              />
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex-shrink-0 flex gap-2 pt-4 border-t border-[var(--glass-border)] mt-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1 transition-all duration-200 hover:bg-white/20 dark:hover:bg-white/10"
            onClick={() => closeSettings()}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 transition-all duration-200"
            onClick={handleSave}
          >
            Save & Reload
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
