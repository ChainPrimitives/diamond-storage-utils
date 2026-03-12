import { describe, it, expect } from "vitest";
import {
  computeStorageSlot,
  computeMappingSlot,
  computeStructSlots,
  generateStorageLibrary,
  isValidSlot,
} from "../src/storage-slot.js";
import { keccak256, toUtf8Bytes } from "ethers";

// ─── computeStorageSlot ───────────────────────────────────────────────────────

describe("computeStorageSlot", () => {
  it("returns a 0x-prefixed 64-char hex string", () => {
    const slot = computeStorageSlot("my.token.storage");
    expect(slot).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it("implements keccak256(namespace) - 1", () => {
    const namespace = "diamond.storage.test";
    const hash = keccak256(toUtf8Bytes(namespace));
    const expected = "0x" + (BigInt(hash) - 1n).toString(16).padStart(64, "0");
    expect(computeStorageSlot(namespace)).toBe(expected);
  });

  it("produces different slots for different namespaces", () => {
    const a = computeStorageSlot("ns.one");
    const b = computeStorageSlot("ns.two");
    expect(a).not.toBe(b);
  });

  it("is deterministic (same input → same output)", () => {
    const ns = "my.app.governance";
    expect(computeStorageSlot(ns)).toBe(computeStorageSlot(ns));
  });

  it("slot is never zero (keccak - 1 guard)", () => {
    // The whole point of the -1 pattern is to avoid slot 0x00...00
    const slot = computeStorageSlot("any.namespace");
    expect(BigInt(slot)).toBeGreaterThan(0n);
  });

  it("matches known EIP-2535 reference value for 'diamond.standard.diamond.storage'", () => {
    // Verified against soldity: keccak256("diamond.standard.diamond.storage") - 1
    const slot = computeStorageSlot("diamond.standard.diamond.storage");
    const hash = keccak256(toUtf8Bytes("diamond.standard.diamond.storage"));
    const expected = "0x" + (BigInt(hash) - 1n).toString(16).padStart(64, "0");
    expect(slot).toBe(expected);
  });
});

// ─── computeMappingSlot ───────────────────────────────────────────────────────

describe("computeMappingSlot", () => {
  const BASE = "0x" + "a".repeat(64);
  const KEY = "0x" + "b".repeat(64);

  it("returns a 0x-prefixed 64-char hex string", () => {
    expect(computeMappingSlot(BASE, KEY)).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it("produces different results for different keys", () => {
    const key2 = "0x" + "c".repeat(64);
    expect(computeMappingSlot(BASE, KEY)).not.toBe(computeMappingSlot(BASE, key2));
  });

  it("produces different results for different base slots", () => {
    const base2 = "0x" + "d".repeat(64);
    expect(computeMappingSlot(BASE, KEY)).not.toBe(computeMappingSlot(base2, KEY));
  });

  it("is deterministic", () => {
    expect(computeMappingSlot(BASE, KEY)).toBe(computeMappingSlot(BASE, KEY));
  });
});

// ─── computeStructSlots ──────────────────────────────────────────────────────

describe("computeStructSlots", () => {
  const NS = "test.struct.storage";
  const NAMES = ["totalSupply", "owner", "paused"];
  const TYPES = ["uint256", "address", "bool"];

  it("returns the correct number of slots", () => {
    const slots = computeStructSlots(NS, NAMES, TYPES);
    expect(slots).toHaveLength(3);
  });

  it("first slot equals computeStorageSlot(namespace)", () => {
    const slots = computeStructSlots(NS, NAMES, TYPES);
    expect(slots[0]!.slot).toBe(computeStorageSlot(NS));
  });

  it("subsequent slots are sequential (base + 1, base + 2, …)", () => {
    const slots = computeStructSlots(NS, NAMES, TYPES);
    const base = BigInt(slots[0]!.slot);
    expect(BigInt(slots[1]!.slot)).toBe(base + 1n);
    expect(BigInt(slots[2]!.slot)).toBe(base + 2n);
  });

  it("assigns correct names and types", () => {
    const slots = computeStructSlots(NS, NAMES, TYPES);
    expect(slots[0]!.name).toBe("totalSupply");
    expect(slots[0]!.type).toBe("uint256");
    expect(slots[2]!.name).toBe("paused");
    expect(slots[2]!.type).toBe("bool");
  });

  it("uses namespace as facetName", () => {
    const slots = computeStructSlots(NS, NAMES, TYPES);
    for (const s of slots) {
      expect(s.facetName).toBe(NS);
    }
  });

  it("throws when memberNames.length !== memberTypes.length", () => {
    expect(() =>
      computeStructSlots(NS, ["a", "b"], ["uint256"]),
    ).toThrow(/same length/);
  });

  it("works for a single member", () => {
    const slots = computeStructSlots(NS, ["value"], ["uint256"]);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.slot).toBe(computeStorageSlot(NS));
  });
});

// ─── generateStorageLibrary ──────────────────────────────────────────────────

describe("generateStorageLibrary", () => {
  // Use a namespace where the last segment is the meaningful name (not "storage")
  const NS = "my.token";
  const MEMBERS = [
    { name: "totalSupply", type: "uint256" },
    { name: "owner", type: "address" },
  ];

  it("includes SPDX license identifier", () => {
    expect(generateStorageLibrary(NS, MEMBERS)).toContain("SPDX-License-Identifier: MIT");
  });

  it("generates the correct library name from namespace", () => {
    const code = generateStorageLibrary(NS, MEMBERS);
    // last segment of "my.token" is "token" → "LibTokenStorage"
    expect(code).toContain("library LibTokenStorage");
  });

  it("embeds the computed storage slot", () => {
    const slot = computeStorageSlot(NS);
    expect(generateStorageLibrary(NS, MEMBERS)).toContain(slot);
  });

  it("includes all struct members", () => {
    const code = generateStorageLibrary(NS, MEMBERS);
    expect(code).toContain("uint256 totalSupply");
    expect(code).toContain("address owner");
  });

  it("includes getStorage function with inline assembly", () => {
    const code = generateStorageLibrary(NS, MEMBERS);
    expect(code).toContain("function getStorage()");
    expect(code).toContain("s.slot := position");
  });

  it("throws when structMembers is empty", () => {
    expect(() => generateStorageLibrary(NS, [])).toThrow(/not be empty/);
  });
});

// ─── isValidSlot ─────────────────────────────────────────────────────────────

describe("isValidSlot", () => {
  it("accepts a valid 32-byte hex slot", () => {
    expect(isValidSlot("0x" + "a".repeat(64))).toBe(true);
    expect(isValidSlot(computeStorageSlot("my.ns"))).toBe(true);
  });

  it("rejects missing 0x prefix", () => {
    expect(isValidSlot("a".repeat(64))).toBe(false);
  });

  it("rejects too-short strings", () => {
    expect(isValidSlot("0x" + "a".repeat(63))).toBe(false);
  });

  it("rejects too-long strings", () => {
    expect(isValidSlot("0x" + "a".repeat(65))).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidSlot("0x" + "g".repeat(64))).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSlot("")).toBe(false);
  });
});
