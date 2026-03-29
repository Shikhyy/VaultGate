/**
 * VaultGate Oracle — Structured Audit Logger
 *
 * Emits JSON-formatted logs for every whitelist action.
 * Writes to both stdout (for monitoring) and append-only log files in oracle/logs/.
 * One log file per day: whitelist-YYYY-MM-DD.log.
 *
 * Per AGENTS.md: "Emits structured logs to oracle/logs/ — one JSON line per whitelist action"
 */

import pino from "pino";
import { mkdirSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { WhitelistLogEntry } from "./types.js";
import { getConfig } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function ensureLogDir(logDir: string): string {
  const resolvedDir = resolve(__dirname, "..", logDir);
  mkdirSync(resolvedDir, { recursive: true });
  return resolvedDir;
}

function getLogFilePath(logDir: string): string {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return resolve(logDir, `whitelist-${date}.log`);
}

// ── Main Logger ─────────────────────────────────────────────────────────

let _logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!_logger) {
    const config = getConfig();
    _logger = pino({
      level: "info",
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    });

    // Ensure log directory exists
    ensureLogDir(config.LOG_DIR);
  }
  return _logger;
}

// ── Whitelist Action Logger ─────────────────────────────────────────────

/**
 * Logs a whitelist action to both the main logger AND the append-only
 * audit log file. Each line in the file is valid JSON for parsing.
 */
function writeAuditLog(entry: WhitelistLogEntry): void {
  const config = getConfig();
  const logger = getLogger();
  const logDir = ensureLogDir(config.LOG_DIR);
  const filePath = getLogFilePath(logDir);

  // Write to structured log file (one JSON line per action)
  const line = JSON.stringify(entry) + "\n";
  try {
    appendFileSync(filePath, line, "utf-8");
  } catch (err) {
    logger.error({ err, filePath }, "Failed to write audit log file");
  }

  // Also log to stdout via pino
  if (entry.event === "whitelist_error") {
    logger.error(entry, `Whitelist error for ${entry.wallet}`);
  } else {
    logger.info(entry, `${entry.event} — ${entry.wallet}`);
  }
}

/**
 * Log a successful whitelist sync (wallet added/updated on-chain).
 */
export function logWhitelistSynced(
  wallet: string,
  jurisdiction: string,
  tier: number,
  tx: string | null
): void {
  writeAuditLog({
    event: "whitelist_synced",
    wallet,
    jurisdiction,
    tier,
    tx,
    ts: Date.now(),
  });
}

/**
 * Log a wallet revocation (marked as sanctioned on-chain).
 */
export function logWhitelistRevoked(
  wallet: string,
  jurisdiction: string,
  tier: number,
  tx: string | null
): void {
  writeAuditLog({
    event: "whitelist_revoked",
    wallet,
    jurisdiction,
    tier,
    tx,
    ts: Date.now(),
  });
}

/**
 * Log a whitelist sync error.
 */
export function logWhitelistError(
  wallet: string,
  jurisdiction: string,
  tier: number,
  error: string
): void {
  writeAuditLog({
    event: "whitelist_error",
    wallet,
    jurisdiction,
    tier,
    tx: null,
    ts: Date.now(),
    error,
  });
}

/**
 * Log a received webhook event.
 */
export function logWebhookReceived(
  wallet: string,
  status: string,
  verified: boolean
): void {
  getLogger().info(
    { wallet, status, signatureVerified: verified },
    `Webhook received — ${wallet} → ${status}`
  );
}
