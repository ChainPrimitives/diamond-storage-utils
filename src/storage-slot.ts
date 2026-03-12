import { keccak256, toUtf8Bytes, solidityPackedKeccak256 } from "ethers";
import type { StorageSlot } from "./types.js";

// ─── Slot Computation ─────────────────────────────────────────────────────────

/**
 * Compute the Diamond storage slot for a given namespace string.
 *
 * Implements the canonical EIP-2535 pattern:
 *   `bytes32(uint256(keccak256(namespace)) - 1)`
 *
 * Subtracting 1 ensures the slot can never be `0x00…00`, which is the
 * default storage position and a common source of collisions.
 *
 * @example
 * ```ts
 * const slot = computeStorageSlot("my.diamond.storage");
 * // → "0x..."
 * ```
 */
export function computeStorageSlot(namespace: string): string {
  const hash = keccak256(toUtf8Bytes(namespace));
  const slot = BigInt(hash) - 1n;
  return "0x" + slot.toString(16).padStart(64, "0");
}

/**
 * Compute the storage slot for a mapping entry.
 *
 * Solidity computes `keccak256(abi.encodePacked(key, baseSlot))`.
 * Both key and baseSlot are treated as `bytes32` values.
 *
 * @param baseSlot - The base slot of the mapping (bytes32 hex string)
 * @param key      - The mapping key (bytes32 hex string, padded if needed)
 */
export function computeMappingSlot(baseSlot: string, key: string): string {
  return solidityPackedKeccak256(["bytes32", "bytes32"], [key, baseSlot]);
}

/**
 * Compute the array of storage slots for a flat struct stored at a namespace.
 *
 * Each struct member occupies one sequential slot starting from `baseSlot`.
 * This is the layout Solidity uses when you store a struct via inline assembly
 * in a Diamond storage library.
 *
 * @param baseNamespace - The namespace used to derive the base slot
 * @param memberNames   - Ordered list of struct member variable names
 * @param memberTypes   - Ordered list of Solidity type strings for each member
 * @returns Array of {@link StorageSlot} objects, one per member
 *
 * @example
 * ```ts
 * const slots = computeStructSlots(
 *   "my.governance.storage",
 *   ["quorum", "votingPeriod", "admin"],
 *   ["uint256", "uint256", "address"]
 * );
 * ```
 */
export function computeStructSlots(
  baseNamespace: string,
  memberNames: string[],
  memberTypes: string[],
): StorageSlot[] {
  if (memberNames.length !== memberTypes.length) {
    throw new Error(
      `computeStructSlots: memberNames (${memberNames.length}) and memberTypes (${memberTypes.length}) must have the same length`,
    );
  }

  const baseSlot = computeStorageSlot(baseNamespace);
  const baseBigInt = BigInt(baseSlot);

  return memberNames.map((name, i) => ({
    name,
    slot: "0x" + (baseBigInt + BigInt(i)).toString(16).padStart(64, "0"),
    facetName: baseNamespace,
    type: memberTypes[i] ?? "unknown",
  }));
}

// ─── Solidity Code Generation ────────────────────────────────────────────────

/**
 * Generate a complete Solidity storage library for the Diamond pattern.
 *
 * The generated code follows this pattern (from EIP-2535 reference impl):
 *
 * ```solidity
 * library LibMyStorage {
 *   bytes32 constant STORAGE_POSITION = keccak256("my.namespace") - 1;
 *   struct Storage { ... }
 *   function getStorage() internal pure returns (Storage storage s) {
 *     bytes32 position = STORAGE_POSITION;
 *     assembly { s.slot := position }
 *   }
 * }
 * ```
 *
 * @param namespace     - The storage namespace (used to compute the slot and library name)
 * @param structMembers - The members of the Storage struct
 * @returns A string of valid Solidity source code
 *
 * @example
 * ```ts
 * const code = generateStorageLibrary("my.token.storage", [
 *   { name: "totalSupply", type: "uint256" },
 *   { name: "owner",       type: "address" },
 * ]);
 * ```
 */
export function generateStorageLibrary(
  namespace: string,
  structMembers: Array<{ name: string; type: string }>,
): string {
  if (structMembers.length === 0) {
    throw new Error(
      "generateStorageLibrary: structMembers must not be empty",
    );
  }

  const slot = computeStorageSlot(namespace);
  const lastSegment = namespace.split(".").pop() ?? namespace;
  const libName =
    "Lib" +
    lastSegment.charAt(0).toUpperCase() +
    lastSegment.slice(1) +
    "Storage";

  const members = structMembers
    .map((m) => `        ${m.type} ${m.name};`)
    .join("\n");

  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library ${libName} {
    bytes32 constant STORAGE_POSITION = ${slot};

    struct Storage {
${members}
    }

    function getStorage() internal pure returns (Storage storage s) {
        bytes32 position = STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }
}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Return true if the given string is a valid bytes32 hex slot.
 *
 * A valid slot is a 0x-prefixed string of exactly 64 hex characters.
 */
export function isValidSlot(slot: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(slot);
}
