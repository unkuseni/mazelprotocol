import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out falsy values", () => {
    expect(cn("a", undefined, null, false, 0, "b")).toBe("a b");
  });

  it("handles conditional object syntax", () => {
    expect(cn({ a: true, b: false }, "c")).toBe("a c");
  });

  it("deduplicates conflicting Tailwind classes (last wins)", () => {
    // tailwind-merge keeps the later class for the same utility group
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("returns an empty string when nothing is passed", () => {
    expect(cn()).toBe("");
  });
});
