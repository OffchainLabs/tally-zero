"use client";

import { Settings } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useState } from "react";

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

import { DEFAULT_FORM_VALUES } from "@/config/arbitrum-governance";
import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
  STORAGE_KEYS,
} from "@/config/storage-keys";
import { useNerdMode } from "@/context/NerdModeContext";
import { useSettingsSheet } from "@/context/SettingsSheetContext";
import { useLocalStorage } from "@/hooks/use-local-storage";

import {
  AdvancedTab,
  GeneralTab,
  RpcTab,
  clearAllSettings,
  clearCache,
  exportSettings,
  getCacheStats,
  getDefaultFormState,
  getTotalStorageUsage,
  importSettings,
} from "./settings";

export function SettingsSheet() {
  const { theme, setTheme } = useTheme();
  const { isOpen, activeTab, openSettings, closeSettings, setActiveTab } =
    useSettingsSheet();

  // LocalStorage settings
  const [storedL2Rpc, setStoredL2Rpc] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );
  const [storedL1Rpc, setStoredL1Rpc] = useLocalStorage(
    STORAGE_KEYS.L1_RPC,
    ""
  );
  const [blockRange, setBlockRange] = useLocalStorage<number>(
    STORAGE_KEYS.BLOCK_RANGE,
    DEFAULT_FORM_VALUES.blockRange
  );
  const [l1BlockRange, setL1BlockRange] = useLocalStorage<number>(
    STORAGE_KEYS.L1_BLOCK_RANGE,
    DEFAULT_FORM_VALUES.l1BlockRange
  );
  const { nerdMode, toggleNerdMode } = useNerdMode();
  const [daysToSearch, setDaysToSearch] = useLocalStorage<number>(
    STORAGE_KEYS.DAYS_TO_SEARCH,
    DEFAULT_FORM_VALUES.daysToSearch
  );
  const [cacheTtl, setCacheTtl] = useLocalStorage<number>(
    STORAGE_KEYS.CACHE_TTL,
    DEFAULT_CACHE_TTL_MS / 1000
  );
  const [skipBundledCache, setSkipBundledCache] = useLocalStorage<boolean>(
    STORAGE_KEYS.SKIP_BUNDLED_CACHE,
    false
  );
  const [tenderlyOrg, setTenderlyOrg] = useLocalStorage<string>(
    STORAGE_KEYS.TENDERLY_ORG,
    DEFAULT_TENDERLY_ORG
  );
  const [tenderlyProject, setTenderlyProject] = useLocalStorage<string>(
    STORAGE_KEYS.TENDERLY_PROJECT,
    DEFAULT_TENDERLY_PROJECT
  );
  const [tenderlyAccessToken, setTenderlyAccessToken] = useLocalStorage<string>(
    STORAGE_KEYS.TENDERLY_ACCESS_TOKEN,
    ""
  );

  // Local form state
  const [l2RpcInput, setL2RpcInput] = useState(storedL2Rpc);
  const [l1RpcInput, setL1RpcInput] = useState(storedL1Rpc);
  const [blockRangeInput, setBlockRangeInput] = useState(String(blockRange));
  const [l1BlockRangeInput, setL1BlockRangeInput] = useState(
    String(l1BlockRange)
  );
  const [daysInput, setDaysInput] = useState(String(daysToSearch));
  const [ttlInput, setTtlInput] = useState(cacheTtl);
  const [ttlCustomInput, setTtlCustomInput] = useState(String(cacheTtl));
  const [tenderlyOrgInput, setTenderlyOrgInput] = useState(tenderlyOrg);
  const [tenderlyProjectInput, setTenderlyProjectInput] =
    useState(tenderlyProject);
  const [tenderlyAccessTokenInput, setTenderlyAccessTokenInput] =
    useState(tenderlyAccessToken);

  // Sync local state when sheet opens
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setL2RpcInput(storedL2Rpc);
        setL1RpcInput(storedL1Rpc);
        setBlockRangeInput(String(blockRange));
        setL1BlockRangeInput(String(l1BlockRange));
        setDaysInput(String(daysToSearch));
        setTtlInput(cacheTtl);
        setTtlCustomInput(String(cacheTtl));
        setTenderlyOrgInput(tenderlyOrg);
        setTenderlyProjectInput(tenderlyProject);
        setTenderlyAccessTokenInput(tenderlyAccessToken);
        openSettings();
      } else {
        closeSettings();
      }
    },
    [
      storedL2Rpc,
      storedL1Rpc,
      blockRange,
      l1BlockRange,
      daysToSearch,
      cacheTtl,
      tenderlyOrg,
      tenderlyProject,
      tenderlyAccessToken,
      openSettings,
      closeSettings,
    ]
  );

  // Save settings
  const handleSave = useCallback(() => {
    setStoredL2Rpc(l2RpcInput);
    setStoredL1Rpc(l1RpcInput);
    setBlockRange(parseInt(blockRangeInput) || DEFAULT_FORM_VALUES.blockRange);
    setL1BlockRange(
      parseInt(l1BlockRangeInput) || DEFAULT_FORM_VALUES.l1BlockRange
    );
    setDaysToSearch(parseInt(daysInput) || DEFAULT_FORM_VALUES.daysToSearch);
    setCacheTtl(ttlInput);
    setTenderlyOrg(tenderlyOrgInput || DEFAULT_TENDERLY_ORG);
    setTenderlyProject(tenderlyProjectInput || DEFAULT_TENDERLY_PROJECT);
    setTenderlyAccessToken(tenderlyAccessTokenInput);
    closeSettings();
    window.location.reload();
  }, [
    l2RpcInput,
    l1RpcInput,
    blockRangeInput,
    l1BlockRangeInput,
    daysInput,
    ttlInput,
    tenderlyOrgInput,
    tenderlyProjectInput,
    tenderlyAccessTokenInput,
    setStoredL2Rpc,
    setStoredL1Rpc,
    setBlockRange,
    setL1BlockRange,
    setDaysToSearch,
    setCacheTtl,
    setTenderlyOrg,
    setTenderlyProject,
    setTenderlyAccessToken,
    closeSettings,
  ]);

  // Action handlers
  const handleClearCache = useCallback(() => {
    const count = clearCache();
    alert(`Cleared ${count} cached items`);
  }, []);

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

  const handleResetDefaults = useCallback(() => {
    const defaults = getDefaultFormState();
    setL2RpcInput(defaults.l2RpcInput);
    setL1RpcInput(defaults.l1RpcInput);
    setBlockRangeInput(defaults.blockRangeInput);
    setL1BlockRangeInput(defaults.l1BlockRangeInput);
    setDaysInput(defaults.daysInput);
    setTtlInput(defaults.ttlInput);
    setTtlCustomInput(defaults.ttlCustomInput);
    setTenderlyOrgInput(defaults.tenderlyOrgInput);
    setTenderlyProjectInput(defaults.tenderlyProjectInput);
    setTenderlyAccessTokenInput(defaults.tenderlyAccessTokenInput);
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

  const cacheStats = getCacheStats();
  const totalStorage = getTotalStorageUsage();

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
                daysInput={daysInput}
                setDaysInput={setDaysInput}
                nerdMode={nerdMode}
                toggleNerdMode={toggleNerdMode}
              />
            </TabsContent>

            <TabsContent value="rpc">
              <RpcTab
                l2RpcInput={l2RpcInput}
                setL2RpcInput={setL2RpcInput}
                l1RpcInput={l1RpcInput}
                setL1RpcInput={setL1RpcInput}
                blockRangeInput={blockRangeInput}
                setBlockRangeInput={setBlockRangeInput}
                l1BlockRangeInput={l1BlockRangeInput}
                setL1BlockRangeInput={setL1BlockRangeInput}
              />
            </TabsContent>

            <TabsContent value="advanced">
              <AdvancedTab
                ttlInput={ttlInput}
                setTtlInput={setTtlInput}
                ttlCustomInput={ttlCustomInput}
                setTtlCustomInput={setTtlCustomInput}
                skipBundledCache={skipBundledCache}
                setSkipBundledCache={setSkipBundledCache}
                tenderlyOrgInput={tenderlyOrgInput}
                setTenderlyOrgInput={setTenderlyOrgInput}
                tenderlyProjectInput={tenderlyProjectInput}
                setTenderlyProjectInput={setTenderlyProjectInput}
                tenderlyAccessTokenInput={tenderlyAccessTokenInput}
                setTenderlyAccessTokenInput={setTenderlyAccessTokenInput}
                onClearCache={handleClearCache}
                onExportSettings={handleExportSettings}
                onImportSettings={handleImportSettings}
                onResetDefaults={handleResetDefaults}
                onClearAllSettings={handleClearAllSettings}
                cacheStats={cacheStats}
                totalStorage={totalStorage}
                nerdMode={nerdMode}
                storedSettings={{
                  storedL2Rpc,
                  storedL1Rpc,
                  blockRange,
                  l1BlockRange,
                  daysToSearch,
                  cacheTtl,
                  skipBundledCache,
                  tenderlyOrg,
                  tenderlyProject,
                  tenderlyAccessToken,
                }}
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
