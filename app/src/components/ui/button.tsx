import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive active:scale-[0.98]",
	{
		variants: {
			variant: {
				default:
					"bg-linear-to-b from-cyan-400 to-cyan-600 text-primary-foreground shadow-lg shadow-cyan-500/25 hover:from-cyan-300 hover:to-cyan-500 hover:shadow-cyan-500/40",
				destructive:
					"bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
				outline:
					"border border-cyan-500/30 bg-surface-1/50 text-foreground hover:bg-cyan-500/10 hover:border-cyan-400/60 shadow-sm",
				secondary:
					"bg-surface-2 text-foreground hover:bg-surface-2/80 border border-border/50",
				ghost: "text-muted-foreground hover:text-cyan-300 hover:bg-cyan-500/10",
				link: "text-cyan-300 underline-offset-4 hover:underline",
				// Cyberpunk variants
				gold: "bg-linear-to-b from-gold-300 to-gold-600 text-black font-bold shadow-lg shadow-gold-500/25 hover:from-gold-200 hover:to-gold-500 hover:shadow-gold-500/40 tracking-wide [text-shadow:0_1px_0_rgba(255,255,255,0.25)]",
				"gold-outline":
					"border border-gold-500/40 text-gold-300 hover:bg-gold-500/10 hover:border-gold-400/70 shadow-sm",
				emerald:
					"bg-linear-to-b from-emerald-400 to-emerald-600 text-black font-bold shadow-lg shadow-emerald-500/25 hover:from-emerald-300 hover:to-emerald-500",
				magenta:
					"bg-linear-to-b from-magenta-400 to-magenta-600 text-white font-bold shadow-lg shadow-magenta-500/25 hover:from-magenta-300 hover:to-magenta-500",
			},
			size: {
				default: "h-10 px-5 py-2 has-[>svg]:px-3",
				xs: "h-7 gap-1 rounded-md px-2.5 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
				lg: "h-11 rounded-lg px-7 has-[>svg]:px-4 text-base",
				xl: "h-12 rounded-xl px-8 has-[>svg]:px-5 text-base",
				icon: "size-9",
				"icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
