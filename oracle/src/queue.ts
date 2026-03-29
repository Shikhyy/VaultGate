/**
 * VaultGate Oracle — Durable Event Queue
 *
 * Persistent queue for KYC events that need to be synced on-chain.
 * Survives process restarts by persisting state to disk.
 *
 * Per PRD NFR-04: "Oracle service must operate correctly after a restart
 * without losing pending KYC sync events (use a durable queue or idempotent retry)"
 *
 * Features:
 * - File-system persistence (oracle/data/pending-events.json)
 * - Deduplication by wallet + event timestamp
 * - Automatic retry of failed events
 * - Background processing loop
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getLogger } from "./logger.js";
import { syncWalletToChain, revokeWallet } from "./whitelist-syncer.js";
import type { KycEvent } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");
const QUEUE_FILE = resolve(DATA_DIR, "pending-events.json");

const MAX_ATTEMPTS = 5;
const PROCESS_INTERVAL_MS = 5_000; // Process queue every 5 seconds

// ── Queue State ─────────────────────────────────────────────────────────

let queue: KycEvent[] = [];
let processingTimer: NodeJS.Timeout | null = null;
let isProcessing = false;

// ── Persistence ─────────────────────────────────────────────────────────

function ensureDataDir(): void {
  mkdirSync(DATA_DIR, { recursive: true });
}

function loadQueue(): void {
  const logger = getLogger();
  ensureDataDir();

  if (!existsSync(QUEUE_FILE)) {
    queue = [];
    return;
  }

  try {
    const data = readFileSync(QUEUE_FILE, "utf-8");
    const parsed = JSON.parse(data);
    queue = Array.isArray(parsed) ? parsed : [];
    const pending = queue.filter((e) => !e.synced);
    logger.info(
      { total: queue.length, pending: pending.length },
      "Loaded event queue from disk"
    );
  } catch (err) {
    logger.error({ err }, "Failed to load event queue — starting fresh");
    queue = [];
  }
}

function persistQueue(): void {
  const logger = getLogger();
  ensureDataDir();

  try {
    writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), "utf-8");
  } catch (err) {
    logger.error({ err }, "Failed to persist event queue to disk");
  }
}

// ── Queue Operations ────────────────────────────────────────────────────

/**
 * Add a KYC event to the queue.
 * Deduplicates by wallet + verifiedAt to prevent processing the same event twice.
 */
export function enqueue(event: KycEvent): void {
  const logger = getLogger();

  // Deduplication check
  const isDuplicate = queue.some(
    (e) =>
      e.wallet === event.wallet &&
      e.verifiedAt === event.verifiedAt &&
      e.status === event.status
  );

  if (isDuplicate) {
    logger.info(
      { wallet: event.wallet, eventId: event.eventId },
      "Duplicate event — skipping"
    );
    return;
  }

  queue.push(event);
  persistQueue();

  logger.info(
    { wallet: event.wallet, eventId: event.eventId, queueSize: queue.length },
    "Event enqueued"
  );
}

/**
 * Process all pending events in the queue.
 * Events are processed sequentially to avoid overwhelming the RPC.
 */
async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  const logger = getLogger();
  const pending = queue.filter((e) => !e.synced && e.attempts < MAX_ATTEMPTS);

  if (pending.length === 0) {
    isProcessing = false;
    return;
  }

  logger.info({ count: pending.length }, "Processing pending events");

  for (const event of pending) {
    try {
      event.attempts++;

      if (event.status === "APPROVED") {
        await syncWalletToChain(event);
      } else if (
        event.status === "REVOKED" ||
        event.status === "REJECTED"
      ) {
        await revokeWallet(event.wallet, event.jurisdiction, event.tier);
      } else {
        // PENDING / EXPIRED — log but don't sync
        logger.info(
          { wallet: event.wallet, status: event.status },
          "Event status not actionable — skipping sync"
        );
      }

      event.synced = true;
      logger.info(
        { wallet: event.wallet, eventId: event.eventId },
        "Event processed successfully"
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(
        {
          wallet: event.wallet,
          eventId: event.eventId,
          attempt: event.attempts,
          maxAttempts: MAX_ATTEMPTS,
          error: errorMsg,
        },
        `Event processing failed (attempt ${event.attempts}/${MAX_ATTEMPTS})`
      );

      if (event.attempts >= MAX_ATTEMPTS) {
        logger.error(
          { wallet: event.wallet, eventId: event.eventId },
          "Event exhausted all retries — requires manual intervention"
        );
      }
    }
  }

  // Clean up fully-synced events older than 24 hours
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  queue = queue.filter((e) => !e.synced || e.receivedAt > cutoff);

  persistQueue();
  isProcessing = false;
}

// ── Queue Lifecycle ─────────────────────────────────────────────────────

/**
 * Start the background queue processor.
 * Loads pending events from disk and begins processing on an interval.
 */
export function startQueueProcessor(): void {
  const logger = getLogger();
  loadQueue();

  processingTimer = setInterval(processQueue, PROCESS_INTERVAL_MS);
  logger.info(
    { intervalMs: PROCESS_INTERVAL_MS },
    "Queue processor started"
  );

  // Process immediately on startup to handle any pending events
  void processQueue();
}

/**
 * Stop the background queue processor.
 * Persists current queue state to disk before stopping.
 */
export function stopQueueProcessor(): void {
  const logger = getLogger();

  if (processingTimer) {
    clearInterval(processingTimer);
    processingTimer = null;
  }

  persistQueue();
  logger.info("Queue processor stopped — state persisted");
}

/**
 * Get queue statistics for the health endpoint.
 */
export function getQueueStats(): {
  total: number;
  pending: number;
  synced: number;
  failed: number;
} {
  const pending = queue.filter(
    (e) => !e.synced && e.attempts < MAX_ATTEMPTS
  ).length;
  const synced = queue.filter((e) => e.synced).length;
  const failed = queue.filter(
    (e) => !e.synced && e.attempts >= MAX_ATTEMPTS
  ).length;

  return { total: queue.length, pending, synced, failed };
}

/** Reset queue — used in tests */
export function resetQueue(): void {
  queue = [];
  if (processingTimer) {
    clearInterval(processingTimer);
    processingTimer = null;
  }
  isProcessing = false;
}
