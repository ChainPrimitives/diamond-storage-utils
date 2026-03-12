/**
 * Shared types for diamond-storage-utils.
 * All public interfaces are re-exported from src/index.ts.
 */

export interface FacetInfo {
  /** Human-readable name of the facet (e.g. "GovernanceFacet") */
  name: string;
  /** Deployed contract address (checksummed) */
  address: string;
  /** 4-byte function selectors exposed by this facet */
  selectors: string[];
  /** Named storage slots that this facet reads/writes */
  storageSlots: StorageSlot[];
}

export interface StorageSlot {
  /** Variable name inside the storage struct */
  name: string;
  /** bytes32 storage slot hash */
  slot: string;
  /** Name of the facet or namespace that owns this slot */
  facetName: string;
  /** Solidity type string, e.g. 'uint256', 'mapping(address => uint256)', 'address' */
  type: string;
}

export interface CollisionReport {
  /** True if at least one storage slot is claimed by more than one facet */
  hasCollisions: boolean;
  collisions: Array<{
    /** The conflicting slot hash */
    slot: string;
    /** Names of the facets that both claim this slot */
    facets: string[];
    /** Variable names associated with this slot, per facet */
    variables: string[];
  }>;
}

export interface DiamondState {
  /** Checksummed address of the Diamond proxy */
  address: string;
  /** All facets currently registered on this Diamond */
  facets: FacetInfo[];
  /** Total number of function selectors across all facets */
  totalSelectors: number;
}

export interface MigrationStep {
  /** Short identifier used in logs (e.g. "v1_add_governance") */
  id: string;
  /** Human-readable description of what this migration does */
  description: string;
  /** Ordered list of storage slot operations to perform */
  operations: StorageOperation[];
}

export type StorageOperation =
  | { type: "rename"; slot: string; oldName: string; newName: string }
  | { type: "retype"; slot: string; oldType: string; newType: string }
  | { type: "add"; slot: StorageSlot }
  | { type: "remove"; slot: string };
