// ─── Storage Slot ─────────────────────────────────────────────────────────────
export {
  computeStorageSlot,
  computeMappingSlot,
  computeStructSlots,
  generateStorageLibrary,
  isValidSlot,
} from "./storage-slot.js";

// ─── Collision Detection ──────────────────────────────────────────────────────
export {
  detectCollisions,
  validateNewFacet,
  buildSlotRegistry,
  formatCollisionReport,
  diffStorageSlots,
} from "./collision-detector.js";

// ─── Selector Registry ────────────────────────────────────────────────────────
export {
  getSelectors,
  getSelectorsExcluding,
  detectSelectorCollisions,
  buildDiamondCut,
  buildDiamondCutBatch,
  deduplicateSelectors,
  isValidSelector,
  FacetCutAction,
} from "./selector-registry.js";

// ─── Diamond Loupe ────────────────────────────────────────────────────────────
export {
  getDiamondState,
  getFacetForSelector,
  resolveFacetNames,
  diffDiamondState,
} from "./diamond-loupe.js";

// ─── Migration ────────────────────────────────────────────────────────────────
export {
  planMigration,
  validateMigration,
  formatMigration,
  snapshotStorageLayout,
} from "./migration.js";

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  FacetInfo,
  StorageSlot,
  CollisionReport,
  DiamondState,
  MigrationStep,
  StorageOperation,
} from "./types.js";
export type { DiamondCutParams, FacetCutActionName } from "./selector-registry.js";
