/**
 * Tests: durable event queue — enqueue, deduplicate, persist, stats
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = resolve(__dirname, "../data-test");

// Mock config to use test data dir and mock mode
vi.mock("../src/config.js", () => ({
  getConfig: () => ({
    SOLANA_RPC_URL: "https://api.devnet.solana.com",
    ACCESS_REGISTRY_PROGRAM_ID: "AccESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    ORACLE_KEYPAIR: "",
    FIREBLOCKS_API_KEY: "",
    FIREBLOCKS_API_SECRET_PATH: "./fireblocks_secret.key",
    FIREBLOCKS_PUBLIC_KEY: "",
    FIREBLOCKS_BASE_URL: "https://sandbox-api.fireblocks.io",
    PORT: 3001,
    LOG_DIR: "./logs-test",
    MOCK_MODE: true,
  }),
  resetConfig: () => {},
}));

// Mock logger to suppress output in tests
vi.mock("../src/logger.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logWhitelistSynced: vi.fn(),
  logWhitelistRevoked: vi.fn(),
  logWhitelistError: vi.fn(),
  logWebhookReceived: vi.fn(),
}));

// Mock whitelist-syncer so queue tests don't need Solana
vi.mock("../src/whitelist-syncer.js", () => ({
  syncWalletToChain: vi.fn().mockResolvedValue("mock_tx_123"),
  revokeWallet: vi.fn().mockResolvedValue("mock_revoke_123"),
}));

import {
  enqueue,
  getQueueStats,
  resetQueue,
  startQueueProcessor,
  stopQueueProcessor,
} from "../src/queue.js";
import type { KycEvent } from "../src/types.js";
import { KYC_EXPIRY_SECONDS } from "../src/types.js";

function makeEvent(overrides: Partial<KycEvent> = {}): KycEvent {
  const now = Math.floor(Date.now() / 1000);
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    wallet: `Wallet${Math.random().toString(36).slice(2)}`,
    status: "APPROVED",
    jurisdiction: "CH",
    tier: 2,
    verifiedAt: now,
    expiresAt: now + KYC_EXPIRY_SECONDS,
    receivedAt: Date.now(),
    attempts: 0,
    synced: false,
    ...overrides,
  };
}

describe("event queue", () => {
  beforeEach(() => {
    resetQueue();
  });

  afterEach(() => {
    stopQueueProcessor();
    resetQueue();
  });

  it("enqueues an event and reports correct stats", () => {
    const event = makeEvent();
    enqueue(event);

    const stats = getQueueStats();
    expect(stats.total).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.synced).toBe(0);
    expect(stats.failed).toBe(0);
  });

  it("deduplicates events with the same wallet + verifiedAt + status", () => {
    const now = Math.floor(Date.now() / 1000);
    const event1 = makeEvent({ wallet: "SameWallet", verifiedAt: now, status: "APPROVED" });
    const event2 = makeEvent({ wallet: "SameWallet", verifiedAt: now, status: "APPROVED" });

    enqueue(event1);
    enqueue(event2);

    const stats = getQueueStats();
    expect(stats.total).toBe(1); // Deduplicated
  });

  it("allows the same wallet with different statuses", () => {
    const now = Math.floor(Date.now() / 1000);
    const approveEvent = makeEvent({ wallet: "SameWallet", verifiedAt: now, status: "APPROVED" });
    const revokeEvent = makeEvent({ wallet: "SameWallet", verifiedAt: now + 1, status: "REVOKED" });

    enqueue(approveEvent);
    enqueue(revokeEvent);

    const stats = getQueueStats();
    expect(stats.total).toBe(2);
  });

  it("allows the same wallet with different timestamps", () => {
    const now = Math.floor(Date.now() / 1000);
    const event1 = makeEvent({ wallet: "SameWallet", verifiedAt: now });
    const event2 = makeEvent({ wallet: "SameWallet", verifiedAt: now + 1000 });

    enqueue(event1);
    enqueue(event2);

    const stats = getQueueStats();
    expect(stats.total).toBe(2);
  });

  it("processes APPROVED events via syncWalletToChain on queue start", async () => {
    const { syncWalletToChain } = await import("../src/whitelist-syncer.js");

    const event = makeEvent({ status: "APPROVED" });
    enqueue(event);

    startQueueProcessor();

    // Give the processor time to run
    await new Promise((r) => setTimeout(r, 200));
    stopQueueProcessor();

    expect(syncWalletToChain).toHaveBeenCalled();
  });

  it("processes REVOKED events via revokeWallet", async () => {
    const { revokeWallet } = await import("../src/whitelist-syncer.js");

    const event = makeEvent({ status: "REVOKED" });
    enqueue(event);

    startQueueProcessor();
    await new Promise((r) => setTimeout(r, 200));
    stopQueueProcessor();

    expect(revokeWallet).toHaveBeenCalledWith(
      event.wallet,
      event.jurisdiction,
      event.tier
    );
  });

  it("reports zero stats on an empty queue", () => {
    const stats = getQueueStats();
    expect(stats.total).toBe(0);
    expect(stats.pending).toBe(0);
    expect(stats.synced).toBe(0);
    expect(stats.failed).toBe(0);
  });
});
