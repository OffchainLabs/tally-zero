"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type SettingsTab = "general" | "rpc" | "advanced";

interface SettingsSheetContextValue {
  isOpen: boolean;
  activeTab: SettingsTab;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setActiveTab: (tab: SettingsTab) => void;
}

const SettingsSheetContext = createContext<SettingsSheetContextValue | null>(
  null
);

export function SettingsSheetProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const openSettings = useCallback((tab?: SettingsTab) => {
    if (tab) {
      setActiveTab(tab);
    }
    setIsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      activeTab,
      openSettings,
      closeSettings,
      setActiveTab,
    }),
    [isOpen, activeTab, openSettings, closeSettings]
  );

  return (
    <SettingsSheetContext.Provider value={value}>
      {children}
    </SettingsSheetContext.Provider>
  );
}

export function useSettingsSheet(): SettingsSheetContextValue {
  const context = useContext(SettingsSheetContext);
  if (!context) {
    throw new Error(
      "useSettingsSheet must be used within a SettingsSheetProvider"
    );
  }
  return context;
}
