import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { apiGet } from "../../api/client";
import type { Page, Ward } from "../../api/types";

const STORAGE_KEY = "mynagari.wardId";

type WardContextValue = {
  wards: Ward[];
  wardId: string;
  setWardId: (id: string) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

const WardContext = createContext<WardContextValue | null>(null);

export function WardProvider({ children }: { children: ReactNode }) {
  const [wards, setWards] = useState<Ward[]>([]);
  const [wardId, setWardIdState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    apiGet<Page<Ward>>("/api/v1/city/wards?limit=50")
      .then((page) => {
        setWards(page.data);
        setWardIdState((current) => {
          const known = page.data.some((ward) => ward.id === current);
          const next = known ? current : (page.data[0]?.id ?? "");
          localStorage.setItem(STORAGE_KEY, next);
          return next;
        });
        setError(null);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setWardId = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setWardIdState(id);
  }, []);

  const value = useMemo(
    () => ({ wards, wardId, setWardId, loading, error, reload }),
    [wards, wardId, setWardId, loading, error, reload],
  );

  return <WardContext.Provider value={value}>{children}</WardContext.Provider>;
}

export function useWard() {
  const value = useContext(WardContext);
  if (!value) {
    throw new Error("useWard must be used inside WardProvider");
  }
  return value;
}
