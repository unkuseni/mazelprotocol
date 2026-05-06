/**
 * Geoblocking utility for MazelProtocol frontend.
 *
 * Checks the user's country via Cloudflare's request.cf.country header
 * (available in Cloudflare Pages/Functions) or via a fallback IP service.
 *
 * Denied countries: jurisdictions where online gambling is restricted.
 * This is a frontend-only check; the smart contracts are permissionless.
 */

const DENIED_COUNTRIES = new Set([
  "US", // United States
  "GB", // United Kingdom
  "AU", // Australia
  "FR", // France
  "NL", // Netherlands
  "CN", // China
]);

const DENIED_REGIONS = new Set([
  "US-VA", // Virginia (explicit lottery restrictions)
  "US-NY", // New York
  "US-WA", // Washington
]);

/**
 * Returns true if the given country/region is restricted from accessing
 * MazelProtocol. If country is undefined (e.g. server-side rendering),
 * this returns false to avoid blocking rendering.
 */
export function isGeoblocked(
  country: string | undefined,
  region: string | undefined,
): boolean {
  if (!country) return false; // Can't determine — allow (server-side rendering, etc.)
  if (DENIED_COUNTRIES.has(country)) return true;
  if (region && DENIED_REGIONS.has(region)) return true;
  return false;
}

/**
 * Returns a user-facing message explaining the geoblock.
 */
export function getGeoblockMessage(): string {
  return "MazelProtocol is not available in your jurisdiction. Please check your local laws regarding decentralized lottery protocols.";
}
