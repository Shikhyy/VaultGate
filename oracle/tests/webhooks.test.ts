/**
 * Tests: webhook signature verification + payload validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config before importing anything that uses it
vi.mock("../src/config.js", () => ({
  getConfig: () => ({
    FIREBLOCKS_API_KEY: "",
    FIREBLOCKS_API_SECRET_PATH: "./fireblocks_secret.key",
    FIREBLOCKS_PUBLIC_KEY: "",
    FIREBLOCKS_BASE_URL: "https://sandbox-api.fireblocks.io",
    MOCK_MODE: true,
  }),
}));

// Mock logger to suppress output in tests
vi.mock("../src/logger.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logWebhookReceived: vi.fn(),
}));

import { verifyFireblocksWebhook } from "../src/webhooks.js";
import { FireblocksWebhookSchema } from "../src/types.js";

// ── Signature Verification ──────────────────────────────────────────────

describe("verifyFireblocksWebhook", () => {
  it("returns true when no public key is configured (dev mode)", () => {
    const result = verifyFireblocksWebhook("payload", "signature", "");
    expect(result).toBe(true);
  });

  it("returns false for an invalid signature with a real public key", () => {
    // Self-signed test key (not a real Fireblocks key)
    const fakePubKey =
      "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xHn/ygWep4";
    const result = verifyFireblocksWebhook(
      '{"type":"test"}',
      "invalidsignature",
      fakePubKey
    );
    expect(result).toBe(false);
  });

  it("returns false when signature is malformed", () => {
    const result = verifyFireblocksWebhook(
      "payload",
      "###not-base64###",
      "somepublickey"
    );
    expect(result).toBe(false);
  });
});

// ── Payload Validation ──────────────────────────────────────────────────

describe("FireblocksWebhookSchema", () => {
  it("parses a valid APPROVED payload", () => {
    const raw = {
      type: "KYC_STATUS_CHANGED",
      data: {
        walletAddress: "7ZmPqBDUB5RjS2Lrm3DGeFoPH6KxNAjqv3F9nL2mQpBz",
        status: "APPROVED",
        jurisdiction: "CH",
        tier: 2,
      },
    };
    const result = FireblocksWebhookSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.status).toBe("APPROVED");
      expect(result.data.data.jurisdiction).toBe("CH");
      expect(result.data.data.tier).toBe(2);
    }
  });

  it("parses a REVOKED event", () => {
    const raw = {
      type: "KYC_STATUS_CHANGED",
      data: {
        walletAddress: "7ZmPqBDUB5RjS2Lrm3DGeFoPH6KxNAjqv3F9nL2mQpBz",
        status: "REVOKED",
      },
    };
    const result = FireblocksWebhookSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it("applies default jurisdiction XX when missing", () => {
    const raw = {
      type: "KYC_STATUS_CHANGED",
      data: {
        walletAddress: "7ZmPqBDUB5RjS2Lrm3DGeFoPH6KxNAjqv3F9nL2mQpBz",
        status: "APPROVED",
      },
    };
    const result = FireblocksWebhookSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.jurisdiction).toBe("XX");
    }
  });

  it("applies default tier 2 when missing", () => {
    const raw = {
      type: "KYC_STATUS_CHANGED",
      data: {
        walletAddress: "7ZmPqBDUB5RjS2Lrm3DGeFoPH6KxNAjqv3F9nL2mQpBz",
        status: "APPROVED",
      },
    };
    const result = FireblocksWebhookSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.data.tier).toBe(2);
    }
  });

  it("rejects a payload missing walletAddress", () => {
    const raw = {
      type: "KYC_STATUS_CHANGED",
      data: {
        status: "APPROVED",
      },
    };
    const result = FireblocksWebhookSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    const raw = {
      type: "KYC_STATUS_CHANGED",
      data: {
        walletAddress: "7ZmPqBDUB5RjS2Lrm3DGeFoPH6KxNAjqv3F9nL2mQpBz",
        status: "INVALID_STATUS",
      },
    };
    const result = FireblocksWebhookSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects a jurisdiction that is not exactly 2 chars", () => {
    const raw = {
      type: "KYC_STATUS_CHANGED",
      data: {
        walletAddress: "7ZmPqBDUB5RjS2Lrm3DGeFoPH6KxNAjqv3F9nL2mQpBz",
        status: "APPROVED",
        jurisdiction: "CHE", // 3 chars — invalid
      },
    };
    const result = FireblocksWebhookSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it("rejects a tier outside 1-3 range", () => {
    const raw = {
      type: "KYC_STATUS_CHANGED",
      data: {
        walletAddress: "7ZmPqBDUB5RjS2Lrm3DGeFoPH6KxNAjqv3F9nL2mQpBz",
        status: "APPROVED",
        tier: 99,
      },
    };
    const result = FireblocksWebhookSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});
