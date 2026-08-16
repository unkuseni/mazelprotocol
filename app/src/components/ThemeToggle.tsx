import { Monitor, Moon, Sun } from "lucide-react";
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
				<Sun size={18} className="text-muted-foreground shrink-0" />
				<Switch
					checked={isDarkMode}
					onCheckedChange={handleThemeChange}
					aria-label="Toggle theme"
					className="shrink-0"
				/>
				<Moon size={18} className="text-muted-foreground shrink-0" />
			</div>
			<button
				type="button"
				onClick={handleSystemTheme}
				className={`p-2 rounded-lg transition-colors flex items-center justify-center shrink-0 ${
					isSystemMode
						? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(0,229,255,0.25)]"
						: "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground border border-border"
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
			className="relative p-2 rounded-lg flex items-center justify-center bg-muted hover:bg-muted/80 border border-border hover:border-border/80 transition-all group"
			aria-label="Toggle theme"
		>
			<div className="relative w-5 h-5 flex items-center justify-center">
				<Sun
					size={16}
					className={`absolute inset-0 m-auto transition-all duration-300 w-4 h-4 ${
						isDarkMode
							? "opacity-0 rotate-90 scale-0"
							: "opacity-100 rotate-0 scale-100"
					} text-foreground`}
				/>
				<Moon
					size={16}
					className={`absolute inset-0 m-auto transition-all duration-300 w-4 h-4 ${
						isDarkMode
							? "opacity-100 rotate-0 scale-100"
							: "opacity-0 -rotate-90 scale-0"
					} text-foreground`}
				/>
			</div>
			{isSystemMode && (
				<div
					className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(0,229,255,0.9)] animate-pulse"
					title="Using system theme"
				/>
			)}
		</button>
	);
}
