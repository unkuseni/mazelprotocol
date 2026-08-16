import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SectionHeading — shared section header for the cyberpunk design system.
 *
 * Standardizes the typography and layout of section headers across pages so
 * the app has a single, consistent visual rhythm (redesign pass).
 *
 * @example
 * ```tsx
 * <SectionHeading
 *   eyebrow="Live On-Chain"
 *   title="Prize Structure"
 *   description="Fixed prizes during normal mode…"
 *   icon={Trophy}
 *   align="center"
 * />
 * ```
 */
interface SectionHeadingProps {
	/** Small uppercase label above the title (e.g. "Live On-Chain") */
	eyebrow?: string;
	/** Main heading */
	title: string;
	/** Supporting paragraph below the title */
	description?: string;
	/** Optional icon rendered beside the title */
	icon?: LucideIcon;
	/** Horizontal alignment */
	align?: "left" | "center";
	/** Additional classes for the wrapper */
	className?: string;
}

export function SectionHeading({
	eyebrow,
	title,
	description,
	icon: Icon,
	align = "center",
	className,
}: SectionHeadingProps) {
	const isCenter = align === "center";
	return (
		<div className={cn("mb-10 sm:mb-12", isCenter && "text-center", className)}>
			{eyebrow && (
				<div
					className={cn(
						"flex w-fit items-center gap-2 px-3 py-1 border border-cyan-500/30 bg-cyan-500/8 mb-3",
						isCenter && "mx-auto",
					)}
					style={{
						clipPath:
							"polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)",
					}}
				>
					<div className="w-1.5 h-1.5 bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(0,229,255,0.9)]" />
					<span className="hud-label">
						{"// "}
						{eyebrow}
					</span>
				</div>
			)}

			<h2
				className={cn(
					"text-2xl sm:text-3xl lg:text-4xl font-black text-foreground font-display tracking-wide uppercase",
					Icon && "flex items-center gap-3",
					isCenter && "justify-center",
				)}
			>
				{Icon && (
					<Icon
						size={28}
						className="shrink-0 text-cyan-300 drop-shadow-[0_0_10px_rgba(0,229,255,0.7)] inline-block"
						aria-hidden
					/>
				)}
				{title}
			</h2>

			{description && (
				<p
					className={cn(
						"mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl",
						isCenter && "mx-auto",
					)}
				>
					{description}
				</p>
			)}
		</div>
	);
}
