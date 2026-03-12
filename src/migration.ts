import type {
  FacetInfo,
  MigrationStep,
  StorageOperation,
  StorageSlot,
} from "./types.js";
import { diffStorageSlots } from "./collision-detector.js";

// ─── Migration Planning ──────────────────────────────────────────────────────

/**
 * Create a migration step by comparing two versions of a facet's storage layout.
 *
 * This function automatically derives the set of {@link StorageOperation}
 * objects by detecting which slots were added, removed, or type-changed between
 * the before and after facet definitions.
 *
 * @param id          - A short, unique identifier for this migration (e.g. "v2_add_roles")
 * @param description - Human-readable description of what the migration does
 * @param before      - Facet as it was before the upgrade
 * @param after       - Facet as it will be after the upgrade
 * @returns A {@link MigrationStep} describing all required storage operations
 *
 * @example
 * ```ts
 * const step = planMigration(
 *   "v2_add_roles",
 *   "Add roles mapping to GovernanceFacet",
 *   facetBefore,
 *   facetAfter
 * );
 * validateMigration(step);
 * ```
 */
export function planMigration(
  id: string,
  description: string,
  before: FacetInfo,
  after: FacetInfo,
): MigrationStep {
  const { added, removed, typeChanged } = diffStorageSlots(
    before.storageSlots,
    after.storageSlots,
  );

  const operations: StorageOperation[] = [];

  for (const slot of added) {
    operations.push({ type: "add", slot });
  }

  for (const slot of removed) {
    operations.push({ type: "remove", slot: slot.slot });
  }

  for (const change of typeChanged) {
    operations.push({
      type: "retype",
      slot: change.slot,
      oldType: change.from,
      newType: change.to,
    });
  }

  return { id, description, operations };
}

// ─── Migration Validation ────────────────────────────────────────────────────

/**
 * Validate that a migration step is safe.
 *
 * Current safety checks:
 * - **No type changes on existing slots** — changing the type of an already-occupied
 *   slot is almost always a critical data corruption bug. If you genuinely need to
 *   retype a slot, clear the data first via an on-chain initializer.
 * - **No duplicate slot IDs** in the operations list.
 *
 * @param step - The migration step to validate
 * @throws If any unsafe operations are detected
 */
export function validateMigration(step: MigrationStep): void {
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const op of step.operations) {
    const slot = op.type === "add" ? op.slot.slot : op.slot;

    if (seen.has(slot)) {
      errors.push(`Duplicate slot in migration "${step.id}": ${slot}`);
    }
    seen.add(slot);

    if (op.type === "retype") {
      errors.push(
        `Unsafe retype in migration "${step.id}": slot ${op.slot} changed from ` +
          `"${op.oldType}" to "${op.newType}". ` +
          `Retyping an occupied storage slot corrupts existing data. ` +
          `Use an on-chain initializer to migrate the value explicitly.`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Migration validation failed:\n` + errors.map((e) => `  - ${e}`).join("\n"),
    );
  }
}

// ─── Migration Serialisation ────────────────────────────────────────────────

/**
 * Format a {@link MigrationStep} as a human-readable changelog entry.
 *
 * @param step - The migration step to format
 * @returns A multi-line string changelog entry
 */
export function formatMigration(step: MigrationStep): string {
  const lines: string[] = [
    `Migration: ${step.id}`,
    `  ${step.description}`,
    `  Operations (${step.operations.length}):`,
  ];

  for (const op of step.operations) {
    switch (op.type) {
      case "add":
        lines.push(`    + ADD  ${op.slot.name} (${op.slot.type}) @ ${op.slot.slot}`);
        break;
      case "remove":
        lines.push(`    - REMOVE @ ${op.slot}`);
        break;
      case "rename":
        lines.push(`    ~ RENAME ${op.oldName} → ${op.newName} @ ${op.slot}`);
        break;
      case "retype":
        lines.push(`    ~ RETYPE ${op.oldType} → ${op.newType} @ ${op.slot}`);
        break;
    }
  }

  return lines.join("\n");
}

// ─── Layout Snapshot ────────────────────────────────────────────────────────

/**
 * Produce a plain JSON-serialisable snapshot of a facet's storage layout.
 *
 * Snapshots can be committed to version control to create an auditable history
 * of storage changes across package versions.
 *
 * @param facets - Array of facets to snapshot
 * @returns A serialisable object with the current date and layout
 */
export function snapshotStorageLayout(facets: FacetInfo[]): {
  timestamp: string;
  layout: Array<{ facet: string; address: string; slots: StorageSlot[] }>;
} {
  return {
    timestamp: new Date().toISOString(),
    layout: facets.map((f) => ({
      facet: f.name,
      address: f.address,
      slots: f.storageSlots,
    })),
  };
}
