import { Contract, Provider } from "ethers";
import type { DiamondState, FacetInfo } from "./types.js";

// ─── DiamondLoupe ABI ────────────────────────────────────────────────────────

const LOUPE_ABI = [
  "function facets() external view returns (tuple(address facetAddress, bytes4[] functionSelectors)[])",
  "function facetFunctionSelectors(address _facet) external view returns (bytes4[])",
  "function facetAddresses() external view returns (address[])",
  "function facetAddress(bytes4 _functionSelector) external view returns (address)",
];

// ─── On-Chain Queries ────────────────────────────────────────────────────────

/**
 * Query the on-chain state of a Diamond via its DiamondLoupe facet.
 *
 * Returns a snapshot of all facets and their registered function selectors.
 * Each {@link FacetInfo} in the result has an empty `storageSlots` array
 * because slot layout is not stored on-chain; populate it manually if needed.
 *
 * @param diamondAddress - Checksummed address of the Diamond proxy
 * @param provider       - An ethers `Provider` connected to the target network
 * @returns A {@link DiamondState} snapshot
 *
 * @example
 * ```ts
 * const provider = new JsonRpcProvider("http://127.0.0.1:8545");
 * const state = await getDiamondState("0x...", provider);
 * console.log(`${state.totalSelectors} selectors across ${state.facets.length} facets`);
 * ```
 */
export async function getDiamondState(
  diamondAddress: string,
  provider: Provider,
): Promise<DiamondState> {
  const diamond = new Contract(diamondAddress, LOUPE_ABI, provider);
  const rawFacets: Array<{
    facetAddress: string;
    functionSelectors: string[];
  }> = await diamond.facets();

  const facets: FacetInfo[] = rawFacets.map((f) => ({
    name: f.facetAddress, // Resolved to a name if caller provides a name map
    address: f.facetAddress,
    selectors: f.functionSelectors.map((s) => s),
    storageSlots: [],
  }));

  return {
    address: diamondAddress,
    facets,
    totalSelectors: facets.reduce((sum, f) => sum + f.selectors.length, 0),
  };
}

/**
 * Query which facet address handles a particular function selector.
 *
 * Returns `null` if the selector is not registered on the Diamond.
 *
 * @param diamondAddress - Address of the Diamond proxy
 * @param selector       - 4-byte selector hex string
 * @param provider       - Ethers `Provider`
 */
export async function getFacetForSelector(
  diamondAddress: string,
  selector: string,
  provider: Provider,
): Promise<string | null> {
  const diamond = new Contract(diamondAddress, LOUPE_ABI, provider);
  const addr: string = await diamond.facetAddress(selector);
  return addr === "0x0000000000000000000000000000000000000000" ? null : addr;
}

/**
 * Resolve facet addresses to human-readable names using a name map.
 *
 * `diamond-deployer-cli` deployment reports include `{ address → name }` maps.
 * Pass one here to get a more readable {@link DiamondState}.
 *
 * @param state   - A {@link DiamondState} snapshot (addresses as names)
 * @param nameMap - Map of `address.toLowerCase() → facet name`
 * @returns A new {@link DiamondState} with `facet.name` resolved where possible
 */
export function resolveFacetNames(
  state: DiamondState,
  nameMap: Record<string, string>,
): DiamondState {
  const normalized: Record<string, string> = {};
  for (const [addr, name] of Object.entries(nameMap)) {
    normalized[addr.toLowerCase()] = name;
  }

  return {
    ...state,
    facets: state.facets.map((f) => ({
      ...f,
      name: normalized[f.address.toLowerCase()] ?? f.address,
    })),
  };
}

// ─── State Diff ──────────────────────────────────────────────────────────────

/**
 * Compute the semantic diff between two {@link DiamondState} snapshots.
 *
 * Useful for:
 * - Verifying upgrades applied the expected changes
 * - Detecting unintended selector removals after an upgrade
 * - Changelog generation
 *
 * @param before - State snapshot before the upgrade
 * @param after  - State snapshot after the upgrade
 * @returns Added facets, removed facets, and changed facets (selector diffs)
 *
 * @example
 * ```ts
 * const before = await getDiamondState(addr, provider);
 * await diamond.diamondCut(cuts, ZeroAddress, "0x");
 * const after = await getDiamondState(addr, provider);
 * const diff = diffDiamondState(before, after);
 * ```
 */
export function diffDiamondState(
  before: DiamondState,
  after: DiamondState,
): {
  added: { facet: string; selectors: string[] }[];
  removed: { facet: string; selectors: string[] }[];
  changed: {
    facet: string;
    addedSelectors: string[];
    removedSelectors: string[];
  }[];
} {
  const beforeMap = new Map(
    before.facets.map((f) => [f.address, new Set(f.selectors)]),
  );
  const afterMap = new Map(
    after.facets.map((f) => [f.address, new Set(f.selectors)]),
  );

  const added: { facet: string; selectors: string[] }[] = [];
  const removed: { facet: string; selectors: string[] }[] = [];
  const changed: {
    facet: string;
    addedSelectors: string[];
    removedSelectors: string[];
  }[] = [];

  for (const [addr, sels] of afterMap) {
    if (!beforeMap.has(addr)) {
      added.push({ facet: addr, selectors: [...sels] });
    } else {
      const oldSels = beforeMap.get(addr)!;
      const addedSels = [...sels].filter((s) => !oldSels.has(s));
      const removedSels = [...oldSels].filter((s) => !sels.has(s));
      if (addedSels.length > 0 || removedSels.length > 0) {
        changed.push({
          facet: addr,
          addedSelectors: addedSels,
          removedSelectors: removedSels,
        });
      }
    }
  }

  for (const [addr, sels] of beforeMap) {
    if (!afterMap.has(addr)) {
      removed.push({ facet: addr, selectors: [...sels] });
    }
  }

  return { added, removed, changed };
}
