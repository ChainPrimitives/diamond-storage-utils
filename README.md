# diamond-storage-utils

[![npm version](https://img.shields.io/npm/v/diamond-storage-utils.svg)](https://www.npmjs.com/package/diamond-storage-utils)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/ChainPrimitives/diamond-storage-utils)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/ChainPrimitives/diamond-storage-utils/pulls)

**TypeScript utility library for safe Diamond (EIP-2535) storage management.**

Diamond proxy contracts split logic across multiple facets, each sharing the same storage space. This creates a silent, critical risk: if two facets write to the same storage slot, they corrupt each other's data — with no compiler error, no revert, no warning.

`diamond-storage-utils` gives you the tools to prevent that:

| Problem | Tool |
|---------|------|
| Where do I store data safely in a Diamond? | `computeStorageSlot` |
| Do my facets accidentally share a slot? | `detectCollisions` |
| Which functions does my facet expose? | `getSelectors` |
| What's the live state of my Diamond on-chain? | `getDiamondState` |
| Is it safe to upgrade my storage layout? | `planMigration` + `validateMigration` |

---

## Table of Contents

- [Installation](#installation)
- [Background: How Diamond Storage Works](#background-how-diamond-storage-works)
- [Usage Guide](#usage-guide)
  - [1. Computing Storage Slots](#1-computing-storage-slots)
  - [2. Generating Solidity Libraries](#2-generating-solidity-libraries)
  - [3. Detecting Storage Collisions](#3-detecting-storage-collisions)
  - [4. Working with Function Selectors](#4-working-with-function-selectors)
  - [5. Querying On-Chain Diamond State](#5-querying-on-chain-diamond-state)
  - [6. Planning Storage Migrations](#6-planning-storage-migrations)
- [API Reference](#api-reference)
- [TypeScript Types](#typescript-types)
- [Development](#development)
- [Contributing](#contributing)
- [Changelog](#changelog)

---

## Installation

```bash
npm install diamond-storage-utils

# ethers v6 is required as a peer dependency
npm install ethers
```

**Requirements:** Node.js >= 18, ethers ^6.0.0

---

## Getting Started

This section walks you through setting up a brand-new TypeScript project that uses `diamond-storage-utils` — from `npm init` to running a complete storage safety check.

### Step 1 — Create your project

```bash
mkdir my-diamond-tooling
cd my-diamond-tooling
npm init -y
```

### Step 2 — Install dependencies

```bash
npm install diamond-storage-utils ethers
npm install -D typescript tsx @types/node
```

> **`tsx`** lets you run `.ts` files directly without a build step — great for scripts and tooling. You can replace it with `ts-node` if you prefer.

### Step 3 — Add a TypeScript config

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### Step 4 — Write your first script

Create `check-storage.ts` and paste the following. It demonstrates the full workflow — compute slots, describe your facets, detect collisions, extract selectors, and build a `diamondCut` call:

```ts
import {
  computeStorageSlot,
  computeStructSlots,
  detectCollisions,
  validateNewFacet,
  formatCollisionReport,
  getSelectors,
  detectSelectorCollisions,
  buildDiamondCut,
  generateStorageLibrary,
} from "diamond-storage-utils";
import type { FacetInfo } from "diamond-storage-utils";

// ─── 1. Compute storage slots ────────────────────────────────────────────────
//
// Each facet needs a unique namespace. The slot is keccak256(namespace) - 1.
// This value goes into your Solidity library as the STORAGE_POSITION constant.

const tokenSlot = computeStorageSlot("my.token.storage");
const govSlot   = computeStorageSlot("my.governance.storage");

console.log("Token slot:     ", tokenSlot);
console.log("Governance slot:", govSlot);
// These are different — no collision possible between the two namespaces.


// ─── 2. Inspect struct member slots ─────────────────────────────────────────
//
// Each struct member occupies a sequential slot starting from the base.
// Useful for verifying layout before writing Solidity.

const govStructSlots = computeStructSlots(
  "my.governance.storage",
  ["quorum", "votingPeriod", "admin"],
  ["uint256", "uint256", "address"]
);

console.log("\nGovernance struct layout:");
for (const s of govStructSlots) {
  console.log(`  ${s.name} (${s.type}): ${s.slot}`);
}


// ─── 3. Generate the Solidity library ───────────────────────────────────────
//
// Paste this output into your Solidity project as LibGovernanceStorage.sol

const solidityCode = generateStorageLibrary("my.governance", [
  { name: "quorum",       type: "uint256" },
  { name: "votingPeriod", type: "uint256" },
  { name: "admin",        type: "address" },
]);

console.log("\nGenerated Solidity library:");
console.log(solidityCode);


// ─── 4. Describe your facets ─────────────────────────────────────────────────
//
// FacetInfo is the central type in this library. It describes a facet's name,
// address, which selectors it exposes, and which storage slots it occupies.
// You typically build these during your deployment or test setup.

const tokenFacet: FacetInfo = {
  name: "TokenFacet",
  address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  selectors: getSelectors([
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
  ]),
  storageSlots: [
    { name: "totalSupply", slot: tokenSlot, facetName: "TokenFacet", type: "uint256" },
  ],
};

const governanceFacet: FacetInfo = {
  name: "GovernanceFacet",
  address: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
  selectors: getSelectors([
    "function propose(address[] targets) external returns (uint256)",
    "function vote(uint256 proposalId, bool support) external",
    "function execute(uint256 proposalId) external",
  ]),
  storageSlots: [
    { name: "quorum",       slot: govStructSlots[0]!.slot, facetName: "GovernanceFacet", type: "uint256" },
    { name: "votingPeriod", slot: govStructSlots[1]!.slot, facetName: "GovernanceFacet", type: "uint256" },
    { name: "admin",        slot: govStructSlots[2]!.slot, facetName: "GovernanceFacet", type: "address" },
  ],
};


// ─── 5. Check for storage slot collisions ───────────────────────────────────
//
// Run this before every deploy. If two facets share a slot, one will silently
// overwrite the other's data — no compiler error, no revert.

const collisionReport = detectCollisions([tokenFacet, governanceFacet]);
console.log("\nCollision check:", formatCollisionReport(collisionReport));
// → ✅ No storage slot collisions detected.


// ─── 6. Validate a new facet before adding it ───────────────────────────────
//
// Before adding a facet to an existing Diamond, check it won't collide
// with any already-registered facets.

const newFacet: FacetInfo = {
  name: "RewardsFacet",
  address: "0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
  selectors: getSelectors(["function claim() external"]),
  storageSlots: [
    {
      name: "rewardPool",
      // Safe: different namespace → different slot
      slot: computeStorageSlot("my.rewards.storage"),
      facetName: "RewardsFacet",
      type: "uint256",
    },
  ],
};

const safetyCheck = validateNewFacet([tokenFacet, governanceFacet], newFacet);
if (safetyCheck.hasCollisions) {
  console.error("Cannot add RewardsFacet:", formatCollisionReport(safetyCheck));
  process.exit(1);
}
console.log("RewardsFacet is safe to add ✅");


// ─── 7. Check for selector collisions ───────────────────────────────────────
//
// Two facets cannot expose the same 4-byte selector. The Diamond would route
// calls to whichever was registered last, silently ignoring the other.

const selectorConflicts = detectSelectorCollisions([
  { name: tokenFacet.name,      selectors: tokenFacet.selectors },
  { name: governanceFacet.name, selectors: governanceFacet.selectors },
  { name: newFacet.name,        selectors: newFacet.selectors },
]);

if (selectorConflicts.length > 0) {
  console.error("Selector conflicts found:", selectorConflicts);
  process.exit(1);
}
console.log("No selector conflicts ✅");


// ─── 8. Build the diamondCut call ───────────────────────────────────────────
//
// Once you're satisfied everything is safe, build the FacetCut structs.
// Pass these to your Diamond's diamondCut() function.

const cut = buildDiamondCut(newFacet.address, newFacet.selectors, "Add");
console.log("\nFacetCut struct for diamondCut():", cut);
// → { facetAddress: "0xCCC...", action: 0, functionSelectors: ["0x4","..."] }
//
// Usage in ethers:
//   await diamond.diamondCut([cut], ethers.ZeroAddress, "0x");

console.log("\n✅ All checks passed. Safe to deploy.");
```

### Step 5 — Run it

```bash
npx tsx check-storage.ts
```

You'll see all the computed slots, the generated Solidity library, and confirmation that no collisions exist.

---

## Background: How Diamond Storage Works

In a regular Solidity contract, state variables are stored sequentially starting at slot `0`. In a Diamond, all facets share the same proxy storage, so using sequential slots would mean different facets overwrite each other.

The solution (from EIP-2535) is the **namespaced storage pattern**:

```solidity
// Each facet computes a unique starting slot from a unique string namespace
bytes32 constant POSITION = keccak256("my.governance.storage") - 1;

// Then uses inline assembly to point a struct at that slot
assembly { s.slot := POSITION }
```

The `-1` ensures the slot is never `0x000...000` (the default slot). Since keccak256 is collision-resistant, two different namespaces will never produce the same slot.

This library helps you compute, verify, and manage these slots from TypeScript — before you deploy.

---

## Usage Guide

### 1. Computing Storage Slots

Use `computeStorageSlot` to get the storage slot that your Solidity library should use:

```ts
import { computeStorageSlot } from "diamond-storage-utils";

// Returns the bytes32 slot for this namespace
const slot = computeStorageSlot("my.governance.storage");
console.log(slot);
// → "0x4b5767b6d33872b6bc8b0eb1f7a1cbb91bf24d..."

// In Solidity, your library would use the same value:
// bytes32 constant STORAGE_POSITION = 0x4b5767b6...;
```

For mapping entries (e.g., `mapping(address => uint256)`), use `computeMappingSlot`:

```ts
import { computeStorageSlot, computeMappingSlot } from "diamond-storage-utils";

const base = computeStorageSlot("my.token.storage");

// Compute the slot for balances[userAddress]
const slot = computeMappingSlot(base, userAddress);
```

For structs with multiple members, use `computeStructSlots` to get the slot for every field:

```ts
import { computeStructSlots } from "diamond-storage-utils";

const slots = computeStructSlots(
  "my.governance.storage",           // namespace
  ["quorum", "votingPeriod", "admin"], // variable names (in order)
  ["uint256", "uint256", "address"]    // their Solidity types
);

// slots[0].slot → position of `quorum`
// slots[1].slot → position of `votingPeriod` (base + 1)
// slots[2].slot → position of `admin`        (base + 2)
```

---

### 2. Generating Solidity Libraries

Instead of writing the Diamond storage library boilerplate by hand, generate it:

```ts
import { generateStorageLibrary } from "diamond-storage-utils";

const code = generateStorageLibrary("my.token", [
  { name: "totalSupply", type: "uint256" },
  { name: "owner",       type: "address" },
  { name: "paused",      type: "bool" },
]);

console.log(code);
```

Output (ready to save as a `.sol` file):

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library LibTokenStorage {
    bytes32 constant STORAGE_POSITION = 0x...;

    struct Storage {
        uint256 totalSupply;
        address owner;
        bool paused;
    }

    function getStorage() internal pure returns (Storage storage s) {
        bytes32 position = STORAGE_POSITION;
        assembly {
            s.slot := position
        }
    }
}
```

> **Tip:** Run `generateStorageLibrary` in your deploy/codegen scripts to keep the TypeScript slot values and Solidity positions always in sync.

---

### 3. Detecting Storage Collisions

Before deploying, check whether any two facets accidentally claim the same storage slot:

```ts
import {
  detectCollisions,
  validateNewFacet,
  formatCollisionReport,
} from "diamond-storage-utils";
import type { FacetInfo } from "diamond-storage-utils";

// Describe your facets' storage layouts
const facets: FacetInfo[] = [
  {
    name: "TokenFacet",
    address: "0x...",
    selectors: [],
    storageSlots: [
      { name: "totalSupply", slot: computeStorageSlot("my.token"), facetName: "TokenFacet", type: "uint256" },
    ],
  },
  {
    name: "GovernanceFacet",
    address: "0x...",
    selectors: [],
    storageSlots: [
      { name: "quorum", slot: computeStorageSlot("my.governance"), facetName: "GovernanceFacet", type: "uint256" },
    ],
  },
];

// Check all facets at once
const report = detectCollisions(facets);
if (report.hasCollisions) {
  // formatCollisionReport prints a readable ❌ summary
  console.error(formatCollisionReport(report));
  process.exit(1);
}

console.log(formatCollisionReport(report)); // → "✅ No storage slot collisions detected."
```

When adding a **new facet** to an existing Diamond, use `validateNewFacet`:

```ts
import { validateNewFacet } from "diamond-storage-utils";

// existingFacets = the facets currently on your Diamond
const report = validateNewFacet(existingFacets, newFacet);

if (report.hasCollisions) {
  throw new Error("This facet collides with existing storage. Cannot safely add it.");
}
```

---

### 4. Working with Function Selectors

Every function in a facet is identified by a 4-byte **selector** (the first 4 bytes of `keccak256(signature)`). You need selectors to call `diamondCut`.

**Extract selectors from an ABI:**

```ts
import { getSelectors } from "diamond-storage-utils";

const selectors = getSelectors([
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);
// → ["0xa9059cbb", "0x70a08231"]
```

**Exclude functions already registered on another facet:**

```ts
import { getSelectorsExcluding } from "diamond-storage-utils";

// Skip owner() — it's on a separate OwnershipFacet
const sels = getSelectorsExcluding(GovernanceABI, ["owner", "transferOwnership"]);
```

**Detect selector collisions before calling diamondCut:**

```ts
import { detectSelectorCollisions } from "diamond-storage-utils";

const conflicts = detectSelectorCollisions([
  { name: "TokenFacet",      selectors: tokenSelectors },
  { name: "GovernanceFacet", selectors: governanceSelectors },
]);

if (conflicts.length > 0) {
  console.error("Selector conflict:", conflicts);
  // → [{ selector: "0x...", facets: ["TokenFacet", "GovernanceFacet"] }]
}
```

**Build the `FacetCut` struct for `diamondCut()`:**

```ts
import { buildDiamondCut, buildDiamondCutBatch } from "diamond-storage-utils";

// Single facet
const cut = buildDiamondCut(facetAddress, selectors, "Add");
await diamond.diamondCut([cut], ZeroAddress, "0x");

// Multiple facets in one transaction
const cuts = buildDiamondCutBatch([
  { facetAddress: addr1, selectors: sels1, action: "Add"     },
  { facetAddress: addr2, selectors: sels2, action: "Replace" },
  { facetAddress: addr3, selectors: sels3, action: "Remove"  },
]);
await diamond.diamondCut(cuts, ZeroAddress, "0x");
```

> `"Remove"` automatically sets `facetAddress` to the zero address as required by EIP-2535.

---

### 5. Querying On-Chain Diamond State

Inspect a live Diamond contract without writing any raw contract calls:

```ts
import { getDiamondState, diffDiamondState, resolveFacetNames } from "diamond-storage-utils";
import { JsonRpcProvider } from "ethers";

const provider = new JsonRpcProvider("https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY");

// Fetch all facets and their selectors
const state = await getDiamondState("0xYourDiamondAddress", provider);
console.log(`${state.facets.length} facets, ${state.totalSelectors} total selectors`);

// Map addresses to readable names (e.g. from your deployment report)
const named = resolveFacetNames(state, {
  "0xaaa...": "DiamondCutFacet",
  "0xbbb...": "GovernanceFacet",
});

// Look up which facet handles a specific function
const owner = await getFacetForSelector("0xYourDiamondAddress", "0x8da5cb5b", provider);
console.log(`owner() is handled by: ${owner}`);
```

**Diff Diamond state before and after an upgrade:**

```ts
const before = await getDiamondState(addr, provider);

// ... execute your diamondCut upgrade ...

const after = await getDiamondState(addr, provider);
const diff = diffDiamondState(before, after);

console.log("Added facets:",   diff.added);
console.log("Removed facets:", diff.removed);
console.log("Changed facets:", diff.changed); // shows added/removed selectors per facet
```

---

### 6. Planning Storage Migrations

When upgrading a facet that changes its storage struct, you need a clear record of what changed and whether it's safe:

```ts
import {
  planMigration,
  validateMigration,
  formatMigration,
  snapshotStorageLayout,
} from "diamond-storage-utils";

// facetBefore and facetAfter are FacetInfo objects describing
// the old and new storage layouts

const step = planMigration(
  "v2_add_admin_role",                 // unique ID
  "Add adminRole field to GovernanceFacet storage", // description
  facetBefore,
  facetAfter
);

// Validate — throws if any unsafe operation is detected
// (e.g., changing the TYPE of an existing slot corrupts stored data)
validateMigration(step);

// Print a human-readable changelog entry
console.log(formatMigration(step));
// Migration: v2_add_admin_role
//   Add adminRole field to GovernanceFacet storage
//   Operations (1):
//     + ADD  adminRole (address) @ 0x...
```

**Snapshot layouts for your audit trail** — commit these JSON files to version control:

```ts
const snapshot = snapshotStorageLayout([facetA, facetB, facetC]);
await fs.writeFile("storage-layout.v2.json", JSON.stringify(snapshot, null, 2));
```

> **Safety rule:** Never change the *type* of an occupied storage slot. `validateMigration` will throw if it detects a retype operation. To change types, write an on-chain initializer that reads the old value, converts it, and writes it back.

---

## API Reference

### Storage Slot Functions

| Function | Description |
|----------|-------------|
| `computeStorageSlot(namespace)` | Compute EIP-2535 slot: `keccak256(namespace) − 1` |
| `computeMappingSlot(baseSlot, key)` | Compute slot for `mapping[key]` |
| `computeStructSlots(ns, names, types)` | Compute sequential slots for struct members |
| `generateStorageLibrary(ns, members)` | Generate complete Solidity storage library code |
| `isValidSlot(slot)` | Check if a string is a valid `bytes32` hex slot |

### Collision Detection Functions

| Function | Description |
|----------|-------------|
| `detectCollisions(facets)` | Find all slot collisions across a set of facets |
| `validateNewFacet(existing, newFacet)` | Check if adding a facet is safe |
| `buildSlotRegistry(facets)` | Build a `slot → owner` index for all facets |
| `formatCollisionReport(report)` | Format a `CollisionReport` as a readable string |
| `diffStorageSlots(before, after)` | Diff two storage layouts (added/removed/retyped) |

### Selector Registry Functions

| Function | Description |
|----------|-------------|
| `getSelectors(abi)` | Extract all 4-byte function selectors from an ABI |
| `getSelectorsExcluding(abi, exclude)` | Extract selectors, skipping named functions |
| `detectSelectorCollisions(facets)` | Find selector conflicts across facets |
| `buildDiamondCut(addr, sels, action)` | Build a `FacetCut` struct for `diamondCut()` |
| `buildDiamondCutBatch(ops)` | Build multiple `FacetCut` structs at once |
| `deduplicateSelectors(selectors)` | Remove duplicates, preserve order |
| `isValidSelector(selector)` | Check if a string is a valid `bytes4` hex selector |
| `FacetCutAction` | Enum: `{ Add: 0, Replace: 1, Remove: 2 }` |

### Diamond Loupe Functions

| Function | Description |
|----------|-------------|
| `getDiamondState(addr, provider)` | Fetch all facets + selectors from a live Diamond |
| `getFacetForSelector(addr, selector, provider)` | Look up which facet handles a selector |
| `resolveFacetNames(state, nameMap)` | Replace addresses with readable facet names |
| `diffDiamondState(before, after)` | Compute added/removed/changed facets between snapshots |

### Migration Functions

| Function | Description |
|----------|-------------|
| `planMigration(id, desc, before, after)` | Auto-derive storage operations from a before/after diff |
| `validateMigration(step)` | Throw if migration contains unsafe operations |
| `formatMigration(step)` | Format migration as a changelog entry string |
| `snapshotStorageLayout(facets)` | Create a JSON-serialisable layout snapshot for audit |

---

## TypeScript Types

```ts
import type {
  FacetInfo,
  StorageSlot,
  CollisionReport,
  DiamondState,
  MigrationStep,
  StorageOperation,
  DiamondCutParams,
  FacetCutActionName,
} from "diamond-storage-utils";
```

```ts
interface FacetInfo {
  name: string;            // e.g. "GovernanceFacet"
  address: string;         // deployed contract address
  selectors: string[];     // 4-byte function selectors
  storageSlots: StorageSlot[];
}

interface StorageSlot {
  name: string;            // variable name in the struct
  slot: string;            // bytes32 slot hash (0x...)
  facetName: string;       // which facet owns this slot
  type: string;            // Solidity type, e.g. "uint256"
}

interface CollisionReport {
  hasCollisions: boolean;
  collisions: Array<{
    slot: string;          // the conflicting slot
    facets: string[];      // facets that both claim it
    variables: string[];   // their respective variable names
  }>;
}

interface DiamondState {
  address: string;         // Diamond proxy address
  facets: FacetInfo[];
  totalSelectors: number;
}

interface MigrationStep {
  id: string;
  description: string;
  operations: StorageOperation[];
}

// Operations are a discriminated union — TypeScript narrows op.type safely
type StorageOperation =
  | { type: "add";    slot: StorageSlot }
  | { type: "remove"; slot: string }
  | { type: "rename"; slot: string; oldName: string; newName: string }
  | { type: "retype"; slot: string; oldType: string; newType: string };
```

---

## Development

```bash
git clone https://github.com/ChainPrimitives/diamond-storage-utils
cd diamond-storage-utils
npm install

npm run lint           # TypeScript type-check (tsc --noEmit)
npm run test           # Run all 95 tests (Vitest)
npm run test:coverage  # Coverage report in ./coverage/
npm run build          # Compile → dist/ (CJS + ESM + .d.ts)
npm run clean          # Remove dist/ and coverage/
```

---

## Contributing

Contributions are welcome! Here's the workflow:

1. [Fork](https://github.com/ChainPrimitives/diamond-storage-utils/fork) the repository
2. Clone your fork and install dependencies:
   ```bash
   git clone https://github.com/YOUR_USERNAME/diamond-storage-utils
   cd diamond-storage-utils && npm install
   ```
3. Create a branch: `git checkout -b feat/my-feature`
4. Make changes — ensure lint and tests pass:
   ```bash
   npm run lint && npm run test
   ```
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add array slot computation helper
   fix: handle empty namespace in computeStorageSlot
   docs: update migration planning examples
   ```
6. Push and open a Pull Request against `main`

**Guidelines:**
- All new features require unit tests (`npm run test:coverage` to check)
- TypeScript `strict: true` — no untyped `any` without justification
- One feature or fix per PR — smaller PRs get reviewed faster
- Update this README if you add or change an API

**Reporting issues:** Search [existing issues](https://github.com/ChainPrimitives/diamond-storage-utils/issues) first. For security vulnerabilities, email **subaskar.sr@gmail.com** privately.

---

## Changelog

### v1.0.0

- 🚀 Initial release
- Storage slots: `computeStorageSlot`, `computeMappingSlot`, `computeStructSlots`, `generateStorageLibrary`
- Collision detection: `detectCollisions`, `validateNewFacet`, `buildSlotRegistry`, `formatCollisionReport`, `diffStorageSlots`
- Selectors: `getSelectors`, `getSelectorsExcluding`, `detectSelectorCollisions`, `buildDiamondCut`, `buildDiamondCutBatch`
- Loupe: `getDiamondState`, `getFacetForSelector`, `resolveFacetNames`, `diffDiamondState`
- Migration: `planMigration`, `validateMigration`, `formatMigration`, `snapshotStorageLayout`
- Dual CJS + ESM output with full TypeScript declarations

---

## License

MIT © 2026 [Subaskar Sivakumar](https://github.com/Subaskar-S)
