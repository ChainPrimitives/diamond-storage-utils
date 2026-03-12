import { describe, it, expect } from "vitest";
import {
  getSelectors,
  getSelectorsExcluding,
  detectSelectorCollisions,
  buildDiamondCut,
  buildDiamondCutBatch,
  deduplicateSelectors,
  isValidSelector,
  FacetCutAction,
} from "../src/selector-registry.js";
import { Interface } from "ethers";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

const GOVERNANCE_ABI = [
  "function propose(address[] targets, uint256[] values) external returns (uint256)",
  "function vote(uint256 proposalId, bool support) external",
  "function execute(uint256 proposalId) external",
];

// ─── getSelectors ────────────────────────────────────────────────────────────

describe("getSelectors", () => {
  it("extracts the correct number of selectors from an ABI array", () => {
    const sels = getSelectors(ERC20_ABI);
    expect(sels).toHaveLength(4);
  });

  it("returns valid 4-byte hex selectors", () => {
    const sels = getSelectors(ERC20_ABI);
    for (const sel of sels) {
      expect(sel).toMatch(/^0x[0-9a-fA-F]{8}$/);
    }
  });

  it("accepts an ethers Interface directly", () => {
    const iface = new Interface(ERC20_ABI);
    const sels = getSelectors(iface);
    expect(sels).toHaveLength(4);
  });

  it("returns empty array for empty ABI", () => {
    expect(getSelectors([])).toHaveLength(0);
  });

  it("returns empty array for ABI with no functions (events only)", () => {
    expect(
      getSelectors(["event Transfer(address indexed from, address indexed to, uint256 value)"]),
    ).toHaveLength(0);
  });

  it("includes the correct transfer() selector (0xa9059cbb)", () => {
    const sels = getSelectors(ERC20_ABI);
    expect(sels).toContain("0xa9059cbb");
  });
});

// ─── getSelectorsExcluding ───────────────────────────────────────────────────

describe("getSelectorsExcluding", () => {
  it("excludes named functions", () => {
    const all = getSelectors(ERC20_ABI);
    const filtered = getSelectorsExcluding(ERC20_ABI, ["approve"]);
    expect(filtered).toHaveLength(all.length - 1);
  });

  it("returns all selectors when exclude list is empty", () => {
    const all = getSelectors(ERC20_ABI);
    const filtered = getSelectorsExcluding(ERC20_ABI, []);
    expect(filtered).toEqual(all);
  });

  it("handles excluding non-existent function names gracefully", () => {
    const all = getSelectors(ERC20_ABI);
    const filtered = getSelectorsExcluding(ERC20_ABI, ["nonExistent"]);
    expect(filtered).toHaveLength(all.length);
  });
});

// ─── detectSelectorCollisions ────────────────────────────────────────────────

describe("detectSelectorCollisions", () => {
  const erc20Sels = getSelectors(ERC20_ABI);
  const govSels = getSelectors(GOVERNANCE_ABI);

  it("returns no collisions for disjoint selector sets", () => {
    const conflicts = detectSelectorCollisions([
      { name: "ERC20Facet", selectors: erc20Sels },
      { name: "GovernanceFacet", selectors: govSels },
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it("detects a collision when two facets share a selector", () => {
    const shared = erc20Sels[0]!;
    const conflicts = detectSelectorCollisions([
      { name: "FacetA", selectors: [shared] },
      { name: "FacetB", selectors: [shared] },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.selector).toBe(shared);
    expect(conflicts[0]!.facets).toContain("FacetA");
    expect(conflicts[0]!.facets).toContain("FacetB");
  });

  it("handles empty facets array", () => {
    expect(detectSelectorCollisions([])).toHaveLength(0);
  });

  it("handles facets with no selectors", () => {
    const conflicts = detectSelectorCollisions([
      { name: "A", selectors: [] },
      { name: "B", selectors: [] },
    ]);
    expect(conflicts).toHaveLength(0);
  });
});

// ─── buildDiamondCut ─────────────────────────────────────────────────────────

describe("buildDiamondCut", () => {
  const ADDR = "0x1234567890123456789012345678901234567890";
  const SELS = ["0xdeadbeef"];

  it("builds an Add cut with action = 0", () => {
    const cut = buildDiamondCut(ADDR, SELS, "Add");
    expect(cut.action).toBe(FacetCutAction.Add);
    expect(cut.facetAddress).toBe(ADDR);
    expect(cut.functionSelectors).toEqual(SELS);
  });

  it("builds a Replace cut with action = 1", () => {
    const cut = buildDiamondCut(ADDR, SELS, "Replace");
    expect(cut.action).toBe(FacetCutAction.Replace);
    expect(cut.facetAddress).toBe(ADDR);
  });

  it("builds a Remove cut with zero address and action = 2", () => {
    const cut = buildDiamondCut(ADDR, SELS, "Remove");
    expect(cut.action).toBe(FacetCutAction.Remove);
    expect(cut.facetAddress).toBe(
      "0x0000000000000000000000000000000000000000",
    );
  });
});

// ─── buildDiamondCutBatch ────────────────────────────────────────────────────

describe("buildDiamondCutBatch", () => {
  const ADDR_A = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const ADDR_B = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

  it("builds a batch of cuts", () => {
    const cuts = buildDiamondCutBatch([
      { facetAddress: ADDR_A, selectors: ["0x11111111"], action: "Add" },
      { facetAddress: ADDR_B, selectors: ["0x22222222"], action: "Replace" },
    ]);
    expect(cuts).toHaveLength(2);
    expect(cuts[0]!.action).toBe(FacetCutAction.Add);
    expect(cuts[1]!.action).toBe(FacetCutAction.Replace);
  });

  it("returns empty array for empty input", () => {
    expect(buildDiamondCutBatch([])).toHaveLength(0);
  });
});

// ─── deduplicateSelectors ────────────────────────────────────────────────────

describe("deduplicateSelectors", () => {
  it("removes duplicate selectors", () => {
    const result = deduplicateSelectors(["0xabcd1234", "0xabcd1234", "0xdeadbeef"]);
    expect(result).toHaveLength(2);
    expect(result).toContain("0xabcd1234");
    expect(result).toContain("0xdeadbeef");
  });

  it("preserves order of first occurrence", () => {
    const result = deduplicateSelectors(["0xbbbb", "0xaaaa", "0xbbbb"]);
    expect(result[0]).toBe("0xbbbb");
    expect(result[1]).toBe("0xaaaa");
  });

  it("handles already-unique array", () => {
    const sels = ["0x11111111", "0x22222222"];
    expect(deduplicateSelectors(sels)).toEqual(sels);
  });

  it("handles empty array", () => {
    expect(deduplicateSelectors([])).toHaveLength(0);
  });
});

// ─── isValidSelector ─────────────────────────────────────────────────────────

describe("isValidSelector", () => {
  it("accepts a valid 4-byte selector", () => {
    expect(isValidSelector("0xa9059cbb")).toBe(true);
    expect(isValidSelector("0x1f931c1c")).toBe(true);
  });

  it("rejects selectors with wrong length", () => {
    expect(isValidSelector("0xa9059c")).toBe(false);   // too short
    expect(isValidSelector("0xa9059cbbb")).toBe(false); // too long
  });

  it("rejects missing 0x prefix", () => {
    expect(isValidSelector("a9059cbb")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidSelector("0xGGGGGGGG")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSelector("")).toBe(false);
  });
});
