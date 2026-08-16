import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"file:text-foreground placeholder:text-muted-foreground/60 selection:bg-cyan-500/30 selection:text-foreground",
				"h-10 w-full min-w-0 rounded-lg border border-cyan-500/20 bg-surface-1 px-3.5 py-2 text-sm shadow-sm",
				"transition-all duration-200 outline-none",
				"file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
				"focus-visible:border-cyan-400/60 focus-visible:ring-1 focus-visible:ring-cyan-400/40 focus-visible:shadow-[0_0_14px_rgba(0,229,255,0.15)]",
				"aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
