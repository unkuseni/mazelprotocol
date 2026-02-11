import * as React from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(
  undefined,
);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "dark"; // Default to dark on server
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return null;
}

function setStoredTheme(theme: Theme) {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem("theme", theme);
}

function getResolvedTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
}

function applyThemeToDocument(resolvedTheme: "light" | "dark") {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  if (resolvedTheme === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
    root.style.colorScheme = "dark";

    // Update theme-color meta tag for dark mode
    updateThemeColorMeta("#0a0f1a");
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
    root.style.colorScheme = "light";

    // Update theme-color meta tag for light mode
    updateThemeColorMeta("#f8fafc");
  }
}

function updateThemeColorMeta(color: string) {
  if (typeof document === "undefined") {
    return;
  }

  // Find existing theme-color meta tag
  let themeColorMeta = document.querySelector('meta[name="theme-color"]');

  if (!themeColorMeta) {
    // Create new meta tag if it doesn't exist
    themeColorMeta = document.createElement("meta");
    themeColorMeta.setAttribute("name", "theme-color");
    document.head.appendChild(themeColorMeta);
  }

  themeColorMeta.setAttribute("content", color);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const stored = getStoredTheme();
    return stored || "dark"; // Default to dark mode as per the app's design
  });

  const resolvedTheme = React.useMemo(() => getResolvedTheme(theme), [theme]);

  // Apply theme on initial render and when resolvedTheme changes
  React.useEffect(() => {
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  // Apply theme on initial mount (client-side only)
  React.useEffect(() => {
    // This ensures the theme is applied even if the initial state was incorrect
    applyThemeToDocument(resolvedTheme);
  }, [resolvedTheme]);

  React.useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      if (theme === "system") {
        const newSystemTheme = getSystemTheme();
        applyThemeToDocument(newSystemTheme);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    setStoredTheme(newTheme);
  }, []);

  const value = React.useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
