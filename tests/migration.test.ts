import { describe, it, expect } from "vitest";
import {
  planMigration,
  validateMigration,
  formatMigration,
  snapshotStorageLayout,
} from "../src/migration.js";
import { computeStorageSlot } from "../src/storage-slot.js";
import type { FacetInfo, StorageSlot } from "../src/types.js";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeSlot(
  name: string,
  slot: string,
  type = "uint256",
  facetName = "TestFacet",
): StorageSlot {
  return { name, slot, facetName, type };
}

function makeFacet(
  name: string,
  storageSlots: StorageSlot[],
  address = "0x0000",
): FacetInfo {
  return { name, address, selectors: [], storageSlots };
}

const SLOT_A = computeStorageSlot("gov.storage.a");
const SLOT_B = computeStorageSlot("gov.storage.b");
const SLOT_C = computeStorageSlot("gov.storage.c");

const slotA = makeSlot("quorum", SLOT_A);
const slotB = makeSlot("votingPeriod", SLOT_B);
const slotC = makeSlot("admin", SLOT_C, "address");

// ─── planMigration ────────────────────────────────────────────────────────────

describe("planMigration", () => {
  it("returns a MigrationStep with the correct id and description", () => {
    const before = makeFacet("GovFacet", [slotA]);
    const after = makeFacet("GovFacet", [slotA]);
    const step = planMigration("v1_no_change", "no-op migration", before, after);
    expect(step.id).toBe("v1_no_change");
    expect(step.description).toBe("no-op migration");
  });

  it("produces an add operation for new slots", () => {
    const before = makeFacet("GovFacet", [slotA]);
    const after = makeFacet("GovFacet", [slotA, slotC]);
    const step = planMigration("v2_add_admin", "Add admin slot", before, after);
    const ops = step.operations.filter((o) => o.type === "add");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: "add" });
  });

  it("produces a remove operation for deleted slots", () => {
    const before = makeFacet("GovFacet", [slotA, slotB]);
    const after = makeFacet("GovFacet", [slotA]);
    const step = planMigration("v2_remove_voting", "Remove votingPeriod", before, after);
    const ops = step.operations.filter((o) => o.type === "remove");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: "remove", slot: SLOT_B });
  });

  it("produces a retype operation for type changes", () => {
    const before = makeFacet("GovFacet", [slotA]);
    const after = makeFacet("GovFacet", [{ ...slotA, type: "int256" }]);
    const step = planMigration("v2_retype", "Retype quorum", before, after);
    const ops = step.operations.filter((o) => o.type === "retype");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: "retype", oldType: "uint256", newType: "int256" });
  });

  it("produces an empty operations array for identical facets", () => {
    const facet = makeFacet("GovFacet", [slotA, slotB]);
    const step = planMigration("v1_noop", "no changes", facet, facet);
    expect(step.operations).toHaveLength(0);
  });
});

// ─── validateMigration ───────────────────────────────────────────────────────

describe("validateMigration", () => {
  it("passes for a safe migration (add only)", () => {
    const before = makeFacet("GovFacet", [slotA]);
    const after = makeFacet("GovFacet", [slotA, slotC]);
    const step = planMigration("v2_safe", "safe add", before, after);
    expect(() => validateMigration(step)).not.toThrow();
  });

  it("passes for a remove-only migration", () => {
    const before = makeFacet("GovFacet", [slotA, slotB]);
    const after = makeFacet("GovFacet", [slotA]);
    const step = planMigration("v2_remove", "safe remove", before, after);
    expect(() => validateMigration(step)).not.toThrow();
  });

  it("throws for a retype operation (unsafe)", () => {
    const before = makeFacet("GovFacet", [slotA]);
    const after = makeFacet("GovFacet", [{ ...slotA, type: "address" }]);
    const step = planMigration("v2_retype", "unsafe retype", before, after);
    expect(() => validateMigration(step)).toThrow(/retype/i);
  });

  it("throws for duplicate slots in operations", () => {
    const step = {
      id: "dup-test",
      description: "has duplicates",
      operations: [
        { type: "remove" as const, slot: SLOT_A },
        { type: "remove" as const, slot: SLOT_A }, // duplicate
      ],
    };
    expect(() => validateMigration(step)).toThrow(/Duplicate/);
  });

  it("passes for empty operations array", () => {
    const step = { id: "v1_noop", description: "no-op", operations: [] };
    expect(() => validateMigration(step)).not.toThrow();
  });
});

// ─── formatMigration ─────────────────────────────────────────────────────────

describe("formatMigration", () => {
  it("includes the migration id in the output", () => {
    const before = makeFacet("GovFacet", [slotA]);
    const after = makeFacet("GovFacet", [slotA, slotC]);
    const step = planMigration("v2_add", "Add admin", before, after);
    expect(formatMigration(step)).toContain("v2_add");
  });

  it("includes the description in the output", () => {
    const before = makeFacet("GovFacet", [slotA]);
    const after = makeFacet("GovFacet", [slotA, slotC]);
    const step = planMigration("v2_add", "Add admin to governance", before, after);
    expect(formatMigration(step)).toContain("Add admin to governance");
  });

  it("includes ADD annotation for add operations", () => {
    const before = makeFacet("GovFacet", [slotA]);
    const after = makeFacet("GovFacet", [slotA, slotC]);
    const step = planMigration("v2", "add", before, after);
    expect(formatMigration(step)).toContain("ADD");
  });

  it("includes REMOVE annotation for remove operations", () => {
    const before = makeFacet("GovFacet", [slotA, slotB]);
    const after = makeFacet("GovFacet", [slotA]);
    const step = planMigration("v2", "remove", before, after);
    expect(formatMigration(step)).toContain("REMOVE");
  });
});

// ─── snapshotStorageLayout ────────────────────────────────────────────────────

describe("snapshotStorageLayout", () => {
  const facets = [
    makeFacet("FacetA", [slotA], "0xAAAA"),
    makeFacet("FacetB", [slotB, slotC], "0xBBBB"),
  ];

  it("includes a ISO 8601 timestamp", () => {
    const snap = snapshotStorageLayout(facets);
    expect(new Date(snap.timestamp).toISOString()).toBe(snap.timestamp);
  });

  it("includes all facets in the layout", () => {
    const snap = snapshotStorageLayout(facets);
    expect(snap.layout).toHaveLength(2);
    expect(snap.layout[0]!.facet).toBe("FacetA");
    expect(snap.layout[1]!.facet).toBe("FacetB");
  });

  it("includes the correct storage slots per facet", () => {
    const snap = snapshotStorageLayout(facets);
    expect(snap.layout[1]!.slots).toHaveLength(2);
    expect(snap.layout[1]!.slots[0]!.name).toBe("votingPeriod");
  });

  it("is JSON-serialisable", () => {
    const snap = snapshotStorageLayout(facets);
    expect(() => JSON.stringify(snap)).not.toThrow();
  });

  it("returns empty layout for empty input", () => {
    const snap = snapshotStorageLayout([]);
    expect(snap.layout).toHaveLength(0);
  });
});
