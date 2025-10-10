'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface DevModeContextValue {
  devMode: boolean;
  setDevMode: (value: boolean) => void;
  toggleDevMode: () => void;
}

const DevModeContext = createContext<DevModeContextValue | undefined>(undefined);

export function DevModeProvider({
  initial,
  children,
}: {
  initial: boolean;
  children: React.ReactNode;
}) {
  const [devMode, setDevMode] = useState(initial);

  useEffect(() => {
    if (devMode) {
      document.cookie = 'dev=true; path=/; SameSite=Lax';
    } else {
      document.cookie = 'dev=; path=/; Max-Age=0; SameSite=Lax';
    }
  }, [devMode]);

  const value = useMemo<DevModeContextValue>(
    () => ({
      devMode,
      setDevMode,
      toggleDevMode: () => setDevMode((prev) => !prev),
    }),
    [devMode],
  );

  return <DevModeContext.Provider value={value}>{children}</DevModeContext.Provider>;
}

export function useDevMode() {
  const ctx = useContext(DevModeContext);
  if (!ctx) {
    throw new Error('useDevMode must be used within a DevModeProvider');
  }
  return ctx;
}
