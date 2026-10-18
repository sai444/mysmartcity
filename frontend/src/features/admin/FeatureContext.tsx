import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiGet } from "../../api/client";

type FeatureContextValue = {
  isEnabled: (key: string) => boolean;
  setFlag: (key: string, enabled: boolean) => void;
  reload: () => void;
};

const FeatureContext = createContext<FeatureContextValue | null>(null);

export function FeatureProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const reload = useCallback(() => {
    apiGet<{ features: Record<string, boolean> }>("/api/v1/features")
      .then((payload) => setFlags(payload.features))
      .catch(() => undefined);
  }, []);

  useEffect(reload, [reload]);

  const isEnabled = useCallback((key: string) => flags[key] !== false, [flags]);
  const setFlag = useCallback((key: string, enabled: boolean) => {
    setFlags((current) => ({ ...current, [key]: enabled }));
  }, []);

  const value = useMemo(() => ({ isEnabled, setFlag, reload }), [isEnabled, setFlag, reload]);
  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
}

export function useFeatures() {
  const value = useContext(FeatureContext);
  if (!value) throw new Error("useFeatures must be used inside FeatureProvider");
  return value;
}
