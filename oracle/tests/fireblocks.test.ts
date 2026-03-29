/**
 * Tests: Fireblocks circuit-breaker / retry logic
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config
vi.mock("../src/config.js", () => ({
  getConfig: () => ({
    FIREBLOCKS_API_KEY: "",
    FIREBLOCKS_API_SECRET_PATH: "./fireblocks_secret.key",
    FIREBLOCKS_PUBLIC_KEY: "",
    FIREBLOCKS_BASE_URL: "https://sandbox-api.fireblocks.io",
    MOCK_MODE: true,
  }),
}));

vi.mock("../src/logger.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { getWalletKycStatus, resetFireblocksClient } from "../src/fireblocks.js";

describe("getWalletKycStatus (mock mode)", () => {
  beforeEach(() => {
    resetFireblocksClient();
  });

  it("returns a mock APPROVED result in mock mode", async () => {
    const result = await getWalletKycStatus("7ZmPqBDUB5RjS2Lrm3DGeFoPH6KxNAjqv3F9nL2mQpBz");

    expect(result).toMatchObject({
      wallet: "7ZmPqBDUB5RjS2Lrm3DGeFoPH6KxNAjqv3F9nL2mQpBz",
      status: "APPROVED",
      jurisdiction: "CH",
      tier: 2,
    });
  });

  it("includes a verifiedAt unix timestamp", async () => {
    const before = Math.floor(Date.now() / 1000) - 1;
    const result = await getWalletKycStatus("TestWallet");
    const after = Math.floor(Date.now() / 1000) + 1;

    expect(result.verifiedAt).toBeGreaterThanOrEqual(before);
    expect(result.verifiedAt).toBeLessThanOrEqual(after);
  });

  it("returns a wallet field matching the input address", async () => {
    const address = "SomeTestWalletAddress12345";
    const result = await getWalletKycStatus(address);
    expect(result.wallet).toBe(address);
  });
});
