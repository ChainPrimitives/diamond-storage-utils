import { FunctionFragment, Interface } from "ethers";

// ─── Selector Extraction ─────────────────────────────────────────────────────

/**
 * Extract all function selectors from an ABI or an ethers {@link Interface}.
 *
 * The selectors are the 4-byte keccak256 fingerprints used by the EVM to
 * route calls to the correct facet in a Diamond proxy.
 *
 * @param abi - Either an array of ABI fragment strings or an ethers `Interface`
 * @returns Array of 4-byte selector hex strings (e.g. `["0x1f931c1c", ...]`)
 *
 * @example
 * ```ts
 * const selectors = getSelectors([
 *   "function transfer(address to, uint256 amount) external returns (bool)",
 *   "function approve(address spender, uint256 amount) external returns (bool)",
 * ]);
 * ```
 */
export function getSelectors(abi: string[] | Interface): string[] {
  const iface = abi instanceof Interface ? abi : new Interface(abi);
  return iface.fragments
    .filter((f): f is FunctionFragment => f.type === "function")
    .map((f) => iface.getFunction(f.name)!.selector);
}

/**
 * Extract selectors from an ABI and exclude specific function names.
 *
 * Useful when you want to skip certain inherited functions (e.g. `owner()`
 * from `Ownable`) that are already registered on another facet.
 *
 * @param abi     - ABI fragment strings or ethers `Interface`
 * @param exclude - Function names to exclude (case-sensitive)
 * @returns Filtered array of 4-byte selector hex strings
 */
export function getSelectorsExcluding(
  abi: string[] | Interface,
  exclude: string[],
): string[] {
  const iface = abi instanceof Interface ? abi : new Interface(abi);
  const excludeSet = new Set(exclude);
  return iface.fragments
    .filter((f): f is FunctionFragment => f.type === "function")
    .filter((f) => !excludeSet.has(f.name))
    .map((f) => iface.getFunction(f.name)!.selector);
}

// ─── Selector Collision Detection ────────────────────────────────────────────

/**
 * Detect duplicate 4-byte function selectors across multiple facets.
 *
 * In a Diamond, each selector can only be routed to **one** facet. If two
 * facets expose the same selector, only one will win (last-write), potentially
 * causing silent bugs that are very hard to diagnose.
 *
 * @param facets - Array of `{ name, selectors }` objects to check
 * @returns Array of `{ selector, facets }` — one entry per collision
 *
 * @example
 * ```ts
 * const conflicts = detectSelectorCollisions([facetA, facetB]);
 * if (conflicts.length > 0) throw new Error("Selector collision!");
 * ```
 */
export function detectSelectorCollisions(
  facets: Array<{ name: string; selectors: string[] }>,
): Array<{ selector: string; facets: string[] }> {
  const selectorMap = new Map<string, string[]>();

  for (const facet of facets) {
    for (const sel of facet.selectors) {
      const existing = selectorMap.get(sel) ?? [];
      existing.push(facet.name);
      selectorMap.set(sel, existing);
    }
  }

  return Array.from(selectorMap.entries())
    .filter(([, f]) => f.length > 1)
    .map(([selector, f]) => ({ selector, facets: f }));
}

// ─── Diamond Cut Builder ────────────────────────────────────────────────────

/** EIP-2535 FacetCutAction enum values */
export const FacetCutAction = {
  Add: 0,
  Replace: 1,
  Remove: 2,
} as const;

export type FacetCutActionName = keyof typeof FacetCutAction;

export interface DiamondCutParams {
  facetAddress: string;
  action: number;
  functionSelectors: string[];
}

/**
 * Build a `DiamondCut` input struct (as a plain JS object) for one facet action.
 *
 * Follows the `IDiamondCut.FacetCut` struct layout from EIP-2535:
 * ```solidity
 * struct FacetCut {
 *   address facetAddress;
 *   FacetCutAction action;   // 0=Add, 1=Replace, 2=Remove
 *   bytes4[] functionSelectors;
 * }
 * ```
 *
 * When `action` is `"Remove"`, the `facetAddress` is automatically set to the
 * zero address as required by the standard.
 *
 * @param facetAddress - The deployed facet contract address
 * @param selectors    - Array of 4-byte selector hex strings
 * @param action       - `"Add"`, `"Replace"`, or `"Remove"`
 * @returns A {@link DiamondCutParams} object ready to pass to `diamondCut()`
 *
 * @example
 * ```ts
 * const cut = buildDiamondCut(facetAddr, selectors, "Add");
 * await diamond.diamondCut([cut], ethers.ZeroAddress, "0x");
 * ```
 */
export function buildDiamondCut(
  facetAddress: string,
  selectors: string[],
  action: FacetCutActionName,
): DiamondCutParams {
  return {
    facetAddress:
      action === "Remove"
        ? "0x0000000000000000000000000000000000000000"
        : facetAddress,
    action: FacetCutAction[action],
    functionSelectors: selectors,
  };
}

/**
 * Build a complete diamond cut array from multiple facet operations in one call.
 *
 * @param operations - Array of `{ facetAddress, selectors, action }` objects
 * @returns Array of {@link DiamondCutParams} for the `diamondCut()` call
 */
export function buildDiamondCutBatch(
  operations: Array<{
    facetAddress: string;
    selectors: string[];
    action: FacetCutActionName;
  }>,
): DiamondCutParams[] {
  return operations.map((op) =>
    buildDiamondCut(op.facetAddress, op.selectors, op.action),
  );
}

// ─── Selector Utilities ──────────────────────────────────────────────────────

/**
 * Deduplicate a flat list of selectors, preserving order.
 */
export function deduplicateSelectors(selectors: string[]): string[] {
  return [...new Set(selectors)];
}

/**
 * Return true if the given string looks like a valid 4-byte selector.
 */
export function isValidSelector(selector: string): boolean {
  return /^0x[0-9a-fA-F]{8}$/.test(selector);
}
