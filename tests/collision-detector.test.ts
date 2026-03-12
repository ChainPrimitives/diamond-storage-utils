import { describe, it, expect } from "vitest";
import {
  detectCollisions,
  validateNewFacet,
  buildSlotRegistry,
  formatCollisionReport,
  diffStorageSlots,
} from "../src/collision-detector.js";
import { computeStorageSlot, computeStructSlots } from "../src/storage-slot.js";
import type { FacetInfo, StorageSlot } from "../src/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSlot(name: string, slot: string, facetName = "TestFacet"): StorageSlot {
  return { name, slot, facetName, type: "uint256" };
}

function makeFacet(
  name: string,
  address: string,
  storageSlots: StorageSlot[],
): FacetInfo {
  return { name, address, selectors: [], storageSlots };
}

const SLOT_A = computeStorageSlot("facet.a.storage");
const SLOT_B = computeStorageSlot("facet.b.storage");
const SLOT_C = computeStorageSlot("facet.c.storage");

const facetA = makeFacet("FacetA", "0xAAAA", [makeSlot("balanceA", SLOT_A, "FacetA")]);
const facetB = makeFacet("FacetB", "0xBBBB", [makeSlot("balanceB", SLOT_B, "FacetB")]);
const facetColliding = makeFacet("FacetCollide", "0xCCCC", [
  makeSlot("badVar", SLOT_A, "FacetCollide"), // ← collides with SLOT_A
]);

// ─── detectCollisions ────────────────────────────────────────────────────────

describe("detectCollisions", () => {
  it("returns no collisions for disjoint facets", () => {
    const report = detectCollisions([facetA, facetB]);
    expect(report.hasCollisions).toBe(false);
    expect(report.collisions).toHaveLength(0);
  });

  it("detects a direct collision between two facets", () => {
    const report = detectCollisions([facetA, facetColliding]);
    expect(report.hasCollisions).toBe(true);
    expect(report.collisions).toHaveLength(1);
    expect(report.collisions[0]!.slot).toBe(SLOT_A);
    expect(report.collisions[0]!.facets).toContain("FacetA");
    expect(report.collisions[0]!.facets).toContain("FacetCollide");
    expect(report.collisions[0]!.variables).toContain("balanceA");
    expect(report.collisions[0]!.variables).toContain("badVar");
  });

  it("handles an empty facets array gracefully", () => {
    expect(detectCollisions([]).hasCollisions).toBe(false);
  });

  it("handles facets with no storage slots", () => {
    const empty = makeFacet("EmptyFacet", "0xDDDD", []);
    expect(detectCollisions([empty, facetA]).hasCollisions).toBe(false);
  });

  it("detects multiple independent collisions", () => {
    const otherCollider = makeFacet("OtherCollider", "0xEEEE", [
      makeSlot("x", SLOT_A, "OtherCollider"),
      makeSlot("y", SLOT_B, "OtherCollider"),
    ]);
    const report = detectCollisions([facetA, facetB, otherCollider]);
    expect(report.hasCollisions).toBe(true);
    expect(report.collisions).toHaveLength(2);
  });
});

// ─── validateNewFacet ─────────────────────────────────────────────────────────

describe("validateNewFacet", () => {
  it("passes for a safe new facet", () => {
    const safeNew = makeFacet("FacetC", "0xFFFF", [makeSlot("amount", SLOT_C, "FacetC")]);
    const report = validateNewFacet([facetA, facetB], safeNew);
    expect(report.hasCollisions).toBe(false);
  });

  it("fails for a colliding new facet", () => {
    const report = validateNewFacet([facetA], facetColliding);
    expect(report.hasCollisions).toBe(true);
  });

  it("does not mutate the existingFacets array", () => {
    const existing = [facetA];
    validateNewFacet(existing, facetColliding);
    expect(existing).toHaveLength(1);
  });
});

// ─── buildSlotRegistry ───────────────────────────────────────────────────────

describe("buildSlotRegistry", () => {
  it("builds an index keyed by slot string", () => {
    const reg = buildSlotRegistry([facetA, facetB]);
    expect(reg.size).toBe(2);
    expect(reg.get(SLOT_A)?.varName).toBe("balanceA");
    expect(reg.get(SLOT_B)?.varName).toBe("balanceB");
  });

  it("last-write wins for duplicate slots", () => {
    const reg = buildSlotRegistry([facetA, facetColliding]);
    // facetColliding is processed last → its entry overwrites facetA's
    expect(reg.get(SLOT_A)?.facetName).toBe("FacetCollide");
  });

  it("returns empty registry for empty input", () => {
    expect(buildSlotRegistry([])).toHaveLength !== undefined;
    expect(buildSlotRegistry([]).size).toBe(0);
  });
});

// ─── formatCollisionReport ───────────────────────────────────────────────────

describe("formatCollisionReport", () => {
  it("returns success message when no collisions", () => {
    const report = detectCollisions([facetA, facetB]);
    expect(formatCollisionReport(report)).toMatch(/No storage slot collisions/);
  });

  it("includes slot hash in collision output", () => {
    const report = detectCollisions([facetA, facetColliding]);
    expect(formatCollisionReport(report)).toContain(SLOT_A);
  });

  it("includes facet names in collision output", () => {
    const report = detectCollisions([facetA, facetColliding]);
    const out = formatCollisionReport(report);
    expect(out).toContain("FacetA");
    expect(out).toContain("FacetCollide");
  });
});

// ─── diffStorageSlots ────────────────────────────────────────────────────────

describe("diffStorageSlots", () => {
  const s1 = makeSlot("supply", SLOT_A);
  const s2 = makeSlot("owner", SLOT_B);
  const s3 = makeSlot("fee", SLOT_C);

  it("detects added slots", () => {
    const diff = diffStorageSlots([s1], [s1, s3]);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]!.slot).toBe(SLOT_C);
  });

  it("detects removed slots", () => {
    const diff = diffStorageSlots([s1, s2], [s1]);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]!.slot).toBe(SLOT_B);
  });

  it("detects type changes", () => {
    const s1Changed = { ...s1, type: "address" };
    const diff = diffStorageSlots([s1], [s1Changed]);
    expect(diff.typeChanged).toHaveLength(1);
    expect(diff.typeChanged[0]!.from).toBe("uint256");
    expect(diff.typeChanged[0]!.to).toBe("address");
  });

  it("returns empty diffs for identical layouts", () => {
    const diff = diffStorageSlots([s1, s2], [s1, s2]);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.typeChanged).toHaveLength(0);
  });

  it("handles empty before", () => {
    const diff = diffStorageSlots([], [s1, s2]);
    expect(diff.added).toHaveLength(2);
    expect(diff.removed).toHaveLength(0);
  });

  it("handles empty after (all removed)", () => {
    const diff = diffStorageSlots([s1, s2], []);
    expect(diff.removed).toHaveLength(2);
    expect(diff.added).toHaveLength(0);
  });
});
