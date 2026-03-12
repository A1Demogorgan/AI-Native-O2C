"use client";

import { createContext, useContext, useMemo, useState } from "react";

type ConsultantArea = {
  areaId: string;
  areaLabel: string;
};

type ConsultantSelectionContextValue = {
  area: ConsultantArea | null;
  setArea: (area: ConsultantArea | null) => void;
};

const ConsultantSelectionContext = createContext<ConsultantSelectionContextValue | null>(null);

export function ConsultantSelectionProvider({ children }: { children: React.ReactNode }) {
  const [area, setArea] = useState<ConsultantArea | null>(null);
  const value = useMemo(() => ({ area, setArea }), [area]);
  return <ConsultantSelectionContext.Provider value={value}>{children}</ConsultantSelectionContext.Provider>;
}

export function useConsultantSelection() {
  const context = useContext(ConsultantSelectionContext);
  if (!context) {
    throw new Error("useConsultantSelection must be used within ConsultantSelectionProvider");
  }
  return context;
}
