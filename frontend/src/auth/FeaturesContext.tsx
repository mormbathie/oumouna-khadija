import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { featuresApi } from '../services/api';
import { useAuth } from './AuthContext';

type FeaturesContextType = { isEnabled: (key: string) => boolean; reload: () => Promise<void>; loaded: boolean };
const FeaturesContext = createContext<FeaturesContextType>({ isEnabled: () => true, reload: async () => undefined, loaded: false });

/** Modules switched on or off by the administrator. Until loaded, everything stays visible. */
export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { authenticated } = useAuth();
  const [states, setStates] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    try { setStates(await featuresApi.states()); setLoaded(true); } catch { /* keep the previous state */ }
  }, []);
  useEffect(() => { if (authenticated) void reload(); }, [authenticated, reload]);
  useEffect(() => {
    const refresh = () => { void reload(); };
    window.addEventListener('features-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('features-changed', refresh); window.removeEventListener('focus', refresh); };
  }, [reload]);
  const isEnabled = useCallback((key: string) => states[key] !== false, [states]);
  return <FeaturesContext.Provider value={{ isEnabled, reload, loaded }}>{children}</FeaturesContext.Provider>;
}

export const useFeatures = () => useContext(FeaturesContext);
