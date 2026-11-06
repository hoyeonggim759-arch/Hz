"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Accent = "blue" | "violet" | "cyan";
type ThemeContextValue = { accent: Accent; setAccent: (accent: Accent) => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const ACCENTS: Accent[] = ["blue", "violet", "cyan"];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<Accent>("blue");

  const applyAccent = useCallback((value: Accent) => {
    document.documentElement.dataset.accent = value;
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("jinqsms-accent");
      if (saved && ACCENTS.includes(saved as Accent)) {
        setAccentState(saved as Accent);
        applyAccent(saved as Accent);
      } else {
        applyAccent("blue");
      }
    } catch {
      applyAccent("blue");
    }
  }, [applyAccent]);

  const setAccent = useCallback((value: Accent) => {
    setAccentState(value);
    applyAccent(value);
    try { window.localStorage.setItem("jinqsms-accent", value); } catch { /* storage may be disabled */ }
  }, [applyAccent]);

  const context = useMemo(() => ({ accent, setAccent }), [accent, setAccent]);
  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>;
}

export function useAccentTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useAccentTheme must be used inside ThemeProvider");
  return value;
}
