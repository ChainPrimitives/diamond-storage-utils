import type { StorageSlot, CollisionReport, FacetInfo } from "./types.js";

// ─── Collision Detection ──────────────────────────────────────────────────────

/**
 * Detect storage slot collisions across multiple facets.
 *
 * A collision occurs when two or more facets declare variables at the same
 * storage slot. This is a critical bug in Diamond contracts because the
 * facets unwittingly read/overwrite each other's data.
 *
 * @param facets - Array of {@link FacetInfo} objects to analyse
 * @returns A {@link CollisionReport} describing any detected collisions
 *
 * @example
 * ```ts
 * const report = detectCollisions([facetA, facetB]);
 * if (report.hasCollisions) {
 *   console.error("Storage collision detected!", report.collisions);
 * }
 * ```
 */
export function detectCollisions(facets: FacetInfo[]): CollisionReport {
  const slotMap = new Map<
    string,
    Array<{ facetName: string; varName: string }>
  >();

  for (const facet of facets) {
    for (const slot of facet.storageSlots) {
      const existing = slotMap.get(slot.slot) ?? [];
      existing.push({ facetName: facet.name, varName: slot.name });
      slotMap.set(slot.slot, existing);
    }
  }

  const collisions: CollisionReport["collisions"] = [];

  for (const [slot, entries] of slotMap) {
    if (entries.length > 1) {
      collisions.push({
        slot,
        facets: entries.map((e) => e.facetName),
        variables: entries.map((e) => e.varName),
      });
    }
  }

  return {
    hasCollisions: collisions.length > 0,
    collisions,
  };
}

/**
 * Validate that a new facet's storage slots do not collide with any existing
 * facets already registered on the Diamond.
 *
 * This is a convenience wrapper around {@link detectCollisions} that makes
 * the intent explicit: you are checking whether it is *safe* to add a new facet.
 *
 * @param existingFacets - Facets currently on the Diamond
 * @param newFacet       - The facet you plan to add
 * @returns A {@link CollisionReport} — check `hasCollisions` before proceeding
 */
export function validateNewFacet(
  existingFacets: FacetInfo[],
  newFacet: FacetInfo,
): CollisionReport {
  return detectCollisions([...existingFacets, newFacet]);
}

/**
 * Build a complete slot registry (slot → owner info) from an array of facets.
 *
 * Useful for audit tooling and generating storage layout reports.
 *
 * @param facets - Array of facets to index
 * @returns A `Map<slot, { facetName, varName, type }>` for every registered slot
 */
export function buildSlotRegistry(
  facets: FacetInfo[],
): Map<string, { facetName: string; varName: string; type: string }> {
  const registry = new Map<
    string,
    { facetName: string; varName: string; type: string }
  >();

  for (const facet of facets) {
    for (const slot of facet.storageSlots) {
      registry.set(slot.slot, {
        facetName: facet.name,
        varName: slot.name,
        type: slot.type,
      });
    }
  }

  return registry;
}

/**
 * Format a {@link CollisionReport} as a human-readable string for CLI output.
 *
 * @param report - The report to format
 * @returns A multi-line string summary
 */
export function formatCollisionReport(report: CollisionReport): string {
  if (!report.hasCollisions) {
    return "✅ No storage slot collisions detected.";
  }

  const lines: string[] = [
    `❌ ${report.collisions.length} storage slot collision(s) detected:\n`,
  ];

  for (const c of report.collisions) {
    lines.push(`  Slot: ${c.slot}`);
    c.facets.forEach((f, i) => {
      lines.push(`    → ${f} :: ${c.variables[i] ?? "(unknown)"}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Slot Diff ────────────────────────────────────────────────────────────────

/**
 * Compute the diff between two sets of storage slots.
 *
 * Useful for upgrade safety checks: call with (beforeSlots, afterSlots) to
 * identify which slots were added, removed, or type-changed.
 */
export function diffStorageSlots(
  before: StorageSlot[],
  after: StorageSlot[],
): {
  added: StorageSlot[];
  removed: StorageSlot[];
  typeChanged: Array<{ slot: string; name: string; from: string; to: string }>;
} {
  const beforeMap = new Map(before.map((s) => [s.slot, s]));
  const afterMap = new Map(after.map((s) => [s.slot, s]));

  const added: StorageSlot[] = [];
  const removed: StorageSlot[] = [];
  const typeChanged: Array<{
    slot: string;
    name: string;
    from: string;
    to: string;
  }> = [];

  for (const [slot, s] of afterMap) {
    if (!beforeMap.has(slot)) {
      added.push(s);
    } else {
      const prev = beforeMap.get(slot)!;
      if (prev.type !== s.type) {
        typeChanged.push({ slot, name: s.name, from: prev.type, to: s.type });
      }
    }
  }

  for (const [slot, s] of beforeMap) {
    if (!afterMap.has(slot)) {
      removed.push(s);
    }
  }

  return { added, removed, typeChanged };
}
