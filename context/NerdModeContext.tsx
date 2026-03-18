"use client";

import { STORAGE_KEYS } from "@config/storage-keys";
import { useLocalStorage } from "@hooks/use-local-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";

interface NerdModeContextValue {
  nerdMode: boolean;
  setNerdMode: (value: boolean) => void;
  toggleNerdMode: () => void;
}

const NerdModeContext = createContext<NerdModeContextValue | null>(null);

export function NerdModeProvider({ children }: { children: React.ReactNode }) {
  const [nerdMode, setNerdModeStorage] = useLocalStorage<boolean>(
    STORAGE_KEYS.NERD_MODE,
    false
  );

  const setNerdMode = useCallback(
    (value: boolean) => {
      setNerdModeStorage(value);
    },
    [setNerdModeStorage]
  );

  const toggleNerdMode = useCallback(() => {
    setNerdModeStorage(!nerdMode);
  }, [nerdMode, setNerdModeStorage]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#nerd") {
      setNerdModeStorage(true);
    }
  }, [setNerdModeStorage]);

  const value = useMemo(
    () => ({
      nerdMode,
      setNerdMode,
      toggleNerdMode,
    }),
    [nerdMode, setNerdMode, toggleNerdMode]
  );

  return (
    <NerdModeContext.Provider value={value}>
      {children}
    </NerdModeContext.Provider>
  );
}

export function useNerdMode(): NerdModeContextValue {
  const context = useContext(NerdModeContext);
  if (!context) {
    throw new Error("useNerdMode must be used within a NerdModeProvider");
  }
  return context;
}
