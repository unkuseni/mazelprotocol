import { Moon, Sun, Monitor } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const handleThemeChange = (checked: boolean) => {
    // If currently in system mode, toggle between light/dark
    if (theme === "system") {
      setTheme(checked ? "dark" : "light");
    } else {
      // Toggle between light and dark
      setTheme(checked ? "dark" : "light");
    }
  };

  const handleSystemTheme = () => {
    setTheme("system");
  };

  const isDarkMode = resolvedTheme === "dark";
  const isSystemMode = theme === "system";

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Sun size={18} className="text-gray-500 shrink-0" />
        <Switch
          checked={isDarkMode}
          onCheckedChange={handleThemeChange}
          aria-label="Toggle theme"
          className="shrink-0"
        />
        <Moon size={18} className="text-gray-500 shrink-0" />
      </div>
      <button
        type="button"
        onClick={handleSystemTheme}
        className={`p-2 rounded-lg transition-colors flex items-center justify-center shrink-0 ${
          isSystemMode
            ? "bg-emerald/20 text-emerald-light border border-emerald/30"
            : "bg-gray-800/50 text-gray-400 hover:bg-gray-800 hover:text-gray-300 border border-gray-700/50"
        }`}
        aria-label="Use system theme"
        title="Use system theme"
      >
        <Monitor size={16} />
      </button>
    </div>
  );
}

export function ThemeToggleCompact() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === "system") {
      // If in system mode, switch to opposite of current system theme
      setTheme(resolvedTheme === "dark" ? "light" : "dark");
    } else {
      // Toggle between light and dark
      setTheme(theme === "dark" ? "light" : "dark");
    }
  };

  const isDarkMode = resolvedTheme === "dark";
  const isSystemMode = theme === "system";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="relative p-2 rounded-lg flex items-center justify-center bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600/50 transition-all group"
      aria-label="Toggle theme"
    >
      <div className="relative w-5 h-5 flex items-center justify-center">
        <Sun
          size={16}
          className={`absolute inset-0 m-auto transition-all duration-300 w-4 h-4 ${
            isDarkMode
              ? "opacity-0 rotate-90 scale-0"
              : "opacity-100 rotate-0 scale-100"
          } text-gray-300`}
        />
        <Moon
          size={16}
          className={`absolute inset-0 m-auto transition-all duration-300 w-4 h-4 ${
            isDarkMode
              ? "opacity-100 rotate-0 scale-100"
              : "opacity-0 -rotate-90 scale-0"
          } text-gray-300`}
        />
      </div>
      {isSystemMode && (
        <div
          className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald animate-pulse"
          title="Using system theme"
        />
      )}
    </button>
  );
}
