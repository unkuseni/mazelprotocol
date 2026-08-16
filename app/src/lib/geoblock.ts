/**
 * Regional compliance utility for MazelProtocol frontend.
 *
 * Checks the user's country via Cloudflare's request.cf.country header
 * (available in Cloudflare Pages/Functions) or via a fallback IP service.
 *
 * This is a frontend-only check to guide users toward supported regions;
 * the smart contracts themselves are permissionless.
 */

const PENDING_COUNTRIES = new Set([
	"US", // United States
	"GB", // United Kingdom
	"AU", // Australia
	"FR", // France
	"NL", // Netherlands
	"CN", // China
]);

const PENDING_REGIONS = new Set([
	"US-VA", // Virginia
	"US-NY", // New York
	"US-WA", // Washington
]);

/**
 * Returns true if the given country/region is not yet supported by
 * MazelProtocol. If country is undefined (e.g. server-side rendering),
 * this returns false to avoid blocking rendering.
 */
export function isRegionPending(
	country: string | undefined,
	region: string | undefined,
): boolean {
	if (!country) return false; // Can't determine — allow (server-side rendering, etc.)
	if (PENDING_COUNTRIES.has(country)) return true;
	if (region && PENDING_REGIONS.has(region)) return true;
	return false;
}

/**
 * Returns a user-facing message to display when a region isn't yet supported.
 */
export function getGeoblockMessage(): string {
	return "MazelProtocol is expanding region by region. We're working to bring provably fair lottery experiences to every jurisdiction. Check back soon or join our community for updates on new region launches.";
}
