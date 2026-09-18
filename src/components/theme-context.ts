import * as React from "react";

export type Theme = "dark" | "light" | "system";

export type ThemeContextValue = {
  theme: Theme;
  resolved: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggle: () => void;
};

export const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
