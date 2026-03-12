# diamond-storage-utils

> Safe Diamond storage layout helpers with collision detection for EIP-2535.

[![npm version](https://img.shields.io/npm/v/diamond-storage-utils.svg)](https://www.npmjs.com/package/diamond-storage-utils)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/ChainPrimitives/diamond-storage-utils)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ChainPrimitives/diamond-storage-utils/pulls)

A TypeScript utility library for safely managing Diamond storage layouts (EIP-2535). Provides typed storage slot helpers, collision detection, facet selector registration, on-chain loupe queries, and storage migration planning.

**Why this package?** Diamond proxy contracts require careful storage management across facets. Storage slot collisions are a critical bug class — two facets writing to the same slot silently corrupt each other's data. This package extracts battle-tested patterns into a well-tested, type-safe library.

---

## Features

- 🔐 **Storage slot computation** — canonical EIP-2535 `keccak256(namespace) - 1` pattern
- 💥 **Collision detection** — detect storage slot conflicts across multiple facets before deployment
- 🔍 **Selector registry** — extract, validate, and deduplicate 4-byte function selectors
- ⛓️ **Diamond Loupe** — query on-chain Diamond state and diff before/after upgrades
- 📦 **Migration planning** — auto-derive migration operations from before/after storage diffs
- 🏗️ **Solidity codegen** — generate complete Diamond storage library `.sol` files
- Full TypeScript types, dual CJS+ESM output, zero runtime dependencies beyond `ethers`

---

## Prerequisites

- **Node.js** `>= 18`
- **ethers** `^6.0.0` (peer dependency)

---

## Installation

```bash
npm install diamond-storage-utils
# ethers is a peer dependency — install it if not already present
npm install ethers
```

---

## Quick Start

```ts
import {
  computeStorageSlot,
  detectCollisions,
  getSelectors,
  validateNewFacet,
} from "diamond-storage-utils";

// 1. Compute a Diamond storage slot (EIP-2535 pattern)
const slot = computeStorageSlot("my.governance.storage");
console.log(slot); // → "0x..."

// 2. Check for storage collisions before deploying
const report = detectCollisions([facetA, facetB, facetC]);
if (report.hasCollisions) {
  console.error("Storage collision detected!", report.collisions);
}

// 3. Extract function selectors from a Solidity ABI
const selectors = getSelectors([
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
]);
```

---

## API Reference

### Storage Slots — `storage-slot`

#### `computeStorageSlot(namespace: string): string`

Compute the Diamond storage position for a given namespace string.

Implements the canonical EIP-2535 pattern: `bytes32(uint256(keccak256(namespace)) - 1)`.

The `-1` offset ensures the slot is never at position `0x00…00`, which is the default storage slot and a common source of accidental collisions.

```ts
const slot = computeStorageSlot("my.token.storage");
// → "0xc7f5f52c4789a2946dc0f86f39f22538b8a7ddeb9c73bbef7b1c55512584a37"
```

---

#### `computeMappingSlot(baseSlot: string, key: string): string`

Compute the storage slot for a mapping entry: `keccak256(key . baseSlot)`.

```ts
const userBalanceSlot = computeMappingSlot(baseSlot, userAddress);
```

---

#### `computeStructSlots(baseNamespace, memberNames, memberTypes): StorageSlot[]`

Compute the array of sequential storage slots for a flat struct stored at a namespace. Returns one `StorageSlot` per member, starting at `computeStorageSlot(baseNamespace)`.

```ts
const slots = computeStructSlots(
  "my.governance.storage",
  ["quorum", "votingPeriod", "admin"],
  ["uint256", "uint256", "address"]
);
```

---

#### `generateStorageLibrary(namespace, structMembers): string`

Generate a complete Solidity Diamond storage library as a string. Ready to write to a `.sol` file.

```ts
const code = generateStorageLibrary("my.token.storage", [
  { name: "totalSupply", type: "uint256" },
  { name: "owner",       type: "address" },
]);
// Generates:
// library LibTokenStorage {
//   bytes32 constant STORAGE_POSITION = 0x...;
//   struct Storage { uint256 totalSupply; address owner; }
//   function getStorage() internal pure returns (Storage storage s) { ... }
// }
```

---

#### `isValidSlot(slot: string): boolean`

Returns `true` if the string is a valid `0x`-prefixed 64-character hex slot.

---

### Collision Detection — `collision-detector`

#### `detectCollisions(facets: FacetInfo[]): CollisionReport`

Detect storage slot collisions across any number of facets.

```ts
const report = detectCollisions([facetA, facetB]);
if (report.hasCollisions) {
  console.error(formatCollisionReport(report));
}
```

---

#### `validateNewFacet(existingFacets, newFacet): CollisionReport`

Check whether a new facet's storage slots are safe to add to an existing Diamond.

```ts
const report = validateNewFacet(existingFacets, candidateFacet);
if (report.hasCollisions) throw new Error("Storage collision — cannot add facet");
```

---

#### `buildSlotRegistry(facets): Map<string, {...}>`

Build a `slot → owner` index for all registered slots. Useful for audit tooling.

---

#### `formatCollisionReport(report: CollisionReport): string`

Format a collision report as a human-readable string with `✅` / `❌` indicators.

---

#### `diffStorageSlots(before, after): { added, removed, typeChanged }`

Diff two sets of storage slots. Useful for upgrade safety checks.

---

### Selector Registry — `selector-registry`

#### `getSelectors(abi: string[] | Interface): string[]`

Extract all 4-byte function selectors from an ABI or ethers `Interface`.

```ts
const selectors = getSelectors(GovernanceFacetABI);
```

---

#### `getSelectorsExcluding(abi, exclude: string[]): string[]`

Extract selectors while excluding specific function names.

```ts
// Exclude inherited owner() from Ownable — already registered elsewhere
const sels = getSelectorsExcluding(FacetABI, ["owner", "renounceOwnership"]);
```

---

#### `detectSelectorCollisions(facets): Array<{ selector, facets }>`

Detect 4-byte selector collisions across facets. Returns empty array if no conflicts.

```ts
const conflicts = detectSelectorCollisions([facetA, facetB]);
if (conflicts.length > 0) throw new Error("Selector collision!");
```

---

#### `buildDiamondCut(facetAddress, selectors, action): DiamondCutParams`

Build a `FacetCut` struct for a `diamondCut()` call. The `action` can be `"Add"`, `"Replace"`, or `"Remove"`. Automatically sets `facetAddress` to the zero address for `"Remove"`.

```ts
const cut = buildDiamondCut(facetAddr, selectors, "Add");
await diamond.diamondCut([cut], ZeroAddress, "0x");
```

---

#### `buildDiamondCutBatch(operations): DiamondCutParams[]`

Build multiple `FacetCut` structs in one call for batch upgrades.

---

#### `deduplicateSelectors(selectors: string[]): string[]`

Remove duplicate selectors while preserving order of first occurrence.

---

#### `isValidSelector(selector: string): boolean`

Returns `true` if the string is a valid `0x`-prefixed 8-character (4-byte) hex selector.

---

### Diamond Loupe — `diamond-loupe`

#### `getDiamondState(diamondAddress, provider): Promise<DiamondState>`

Query the on-chain state of a Diamond via its DiamondLoupe facet.

```ts
const provider = new JsonRpcProvider("http://127.0.0.1:8545");
const state = await getDiamondState(diamondAddress, provider);
console.log(`${state.totalSelectors} selectors across ${state.facets.length} facets`);
```

---

#### `getFacetForSelector(diamondAddress, selector, provider): Promise<string | null>`

Resolve which facet handles a given 4-byte selector. Returns `null` if not registered.

---

#### `resolveFacetNames(state, nameMap): DiamondState`

Replace facet addresses with human-readable names from a `{ address → name }` map (e.g. from a `diamond-deployer-cli` deployment report).

---

#### `diffDiamondState(before, after): { added, removed, changed }`

Compute the semantic diff between two `DiamondState` snapshots.

```ts
const before = await getDiamondState(addr, provider);
await diamond.diamondCut(cuts, ZeroAddress, "0x");
const after = await getDiamondState(addr, provider);
const diff = diffDiamondState(before, after);
```

---

### Migration — `migration`

#### `planMigration(id, description, before, after): MigrationStep`

Automatically derive migration operations from the diff between two facet storage layouts.

```ts
const step = planMigration(
  "v2_add_roles",
  "Add roles mapping to GovernanceFacet",
  facetBefore,
  facetAfter
);
```

---

#### `validateMigration(step): void`

Validate migration safety. Throws if:
- Any `retype` operations are present (retyping an occupied slot corrupts data)
- Duplicate slot IDs appear in the operations list

---

#### `formatMigration(step): string`

Format a migration step as a changelog entry with `+ADD`, `-REMOVE`, `~RENAME`, `~RETYPE` annotations.

---

#### `snapshotStorageLayout(facets): { timestamp, layout }`

Produce a JSON-serialisable snapshot of all facets' storage layouts. Commit snapshots to version control for a complete audit trail of storage changes.

---

## Types

```ts
interface FacetInfo {
  name: string;
  address: string;
  selectors: string[];        // 4-byte function selectors
  storageSlots: StorageSlot[];
}

interface StorageSlot {
  name: string;               // variable name
  slot: string;               // bytes32 slot hash
  facetName: string;
  type: string;               // Solidity type string
}

interface CollisionReport {
  hasCollisions: boolean;
  collisions: Array<{
    slot: string;
    facets: string[];
    variables: string[];
  }>;
}

interface DiamondState {
  address: string;
  facets: FacetInfo[];
  totalSelectors: number;
}

interface MigrationStep {
  id: string;
  description: string;
  operations: StorageOperation[];
}

type StorageOperation =
  | { type: "rename"; slot: string; oldName: string; newName: string }
  | { type: "retype"; slot: string; oldType: string; newType: string }
  | { type: "add";    slot: StorageSlot }
  | { type: "remove"; slot: string };
```

---

## Development

```bash
git clone https://github.com/ChainPrimitives/diamond-storage-utils
cd diamond-storage-utils
npm install
npm run build          # Compile TypeScript → dist/
npm run test           # Run all tests (Vitest)
npm run test:coverage  # Coverage report (v8)
npm run lint           # Type-check with tsc --noEmit
npm run clean          # Remove dist/ and coverage/
```

---

## Contributing

Contributions are welcome!

1. **Fork** the repository on GitHub
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/diamond-storage-utils`
3. **Create a branch**: `git checkout -b feat/my-feature`
4. **Make your changes** and ensure tests pass: `npm run lint && npm run test`
5. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add array slot computation helper
   fix: handle empty namespace in computeStorageSlot
   docs: add migration planning examples
   ```
6. **Push** and open a **Pull Request** against `main`

### Guidelines

- **Tests are required.** New features must include unit tests. Run `npm run test:coverage`.
- **TypeScript strict mode.** No `any` casts without strong justification.
- **Keep PRs focused.** One feature or fix per PR.
- **Update the README** if your change adds or modifies an API.
- **No breaking changes** without prior discussion in a GitHub issue.

### Reporting Issues

- Search [existing issues](https://github.com/ChainPrimitives/diamond-storage-utils/issues) before opening a new one.
- Include your Node.js version, OS, and the exact error message.
- For security vulnerabilities, email **subaskar.sr@gmail.com** directly.

---

## Changelog

### v1.0.0

- 🚀 Initial release
- `computeStorageSlot`, `computeMappingSlot`, `computeStructSlots`, `generateStorageLibrary`
- `detectCollisions`, `validateNewFacet`, `buildSlotRegistry`, `formatCollisionReport`, `diffStorageSlots`
- `getSelectors`, `getSelectorsExcluding`, `detectSelectorCollisions`, `buildDiamondCut`, `buildDiamondCutBatch`
- `getDiamondState`, `getFacetForSelector`, `resolveFacetNames`, `diffDiamondState`
- `planMigration`, `validateMigration`, `formatMigration`, `snapshotStorageLayout`
- Full TypeScript types, dual CJS + ESM output

---

## License

MIT © 2026 [Subaskar Sivakumar](https://github.com/Subaskar-S)
