import { describe, expect, it } from "vitest";
import { getGeoblockMessage, isRegionPending } from "./geoblock";

describe("isRegionPending", () => {
	it("returns true for pending countries", () => {
		expect(isRegionPending("US", undefined)).toBe(true);
		expect(isRegionPending("GB", undefined)).toBe(true);
		expect(isRegionPending("AU", undefined)).toBe(true);
		expect(isRegionPending("FR", undefined)).toBe(true);
		expect(isRegionPending("NL", undefined)).toBe(true);
		expect(isRegionPending("CN", undefined)).toBe(true);
	});

	it("returns true for pending regions even in an otherwise-allowed country", () => {
		expect(isRegionPending("CA", "US-NY")).toBe(true);
		expect(isRegionPending("MX", "US-VA")).toBe(true);
		expect(isRegionPending("DE", "US-WA")).toBe(true);
	});

	it("returns false for supported countries and regions", () => {
		expect(isRegionPending("CA", undefined)).toBe(false);
		expect(isRegionPending("DE", undefined)).toBe(false);
		expect(isRegionPending("CA", "CA-ON")).toBe(false);
	});

	it("returns false when country is undefined (SSR / unknown)", () => {
		expect(isRegionPending(undefined, undefined)).toBe(false);
		expect(isRegionPending(undefined, "US-NY")).toBe(false);
	});

	it("is case-sensitive (lowercase input is not matched)", () => {
		// The set stores uppercase codes; lowercase input must not silently match.
		expect(isRegionPending("us", undefined)).toBe(false);
	});
});

describe("getGeoblockMessage", () => {
	it("returns a non-empty user-facing message", () => {
		const message = getGeoblockMessage();
		expect(message.length).toBeGreaterThan(0);
		expect(message).toContain("MazelProtocol");
	});
});
