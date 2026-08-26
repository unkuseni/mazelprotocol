import { describe, expect, it } from "vitest";
import { consumePendingOpen, requestWalletOpen } from "./appkit";

/**
 * Regression tests for the lazy wallet-init handshake: connect clicks made
 * before AppKit finishes initializing must be queued and replayed (and a
 * no-arg open must NOT be confused with "nothing queued").
 */
describe("pending wallet open queue", () => {
	it("returns null when nothing was queued", () => {
		expect(consumePendingOpen()).toBeNull();
	});

	it("round-trips options and consumes only once", () => {
		requestWalletOpen({ view: "Connect", namespace: "solana" });
		expect(consumePendingOpen()).toEqual({
			view: "Connect",
			namespace: "solana",
		});
		expect(consumePendingOpen()).toBeNull();
	});

	it("distinguishes a no-arg open (undefined) from nothing queued", () => {
		requestWalletOpen();
		expect(consumePendingOpen()).toBeUndefined();
	});

	it("keeps the most recent request", () => {
		requestWalletOpen({ view: "Account" });
		requestWalletOpen({ view: "Connect" });
		expect(consumePendingOpen()).toEqual({ view: "Connect" });
	});
});
