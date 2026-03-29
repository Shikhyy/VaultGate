/**
 * VaultGate Oracle — Type Definitions & Zod Schemas
 *
 * Shared types for webhook payloads, KYC events, whitelist log entries,
 * and on-chain PDA data. All webhook payloads are validated at runtime
 * via Zod before processing.
 */

import { z } from "zod";

// ── Fireblocks Webhook Payload ──────────────────────────────────────────

/**
 * Fireblocks sends various webhook event types.
 * We care about KYC status changes from their identity verification flow.
 */
export const FireblocksWebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.string().optional(),
    walletAddress: z.string().min(1, "walletAddress is required"),
    status: z.enum([
      "APPROVED",
      "REJECTED",
      "PENDING",
      "EXPIRED",
      "REVOKED",
    ]),
    jurisdiction: z
      .string()
      .length(2, "jurisdiction must be ISO 3166-1 alpha-2")
      .optional()
      .default("XX"),
    tier: z.coerce.number().int().min(1).max(3).optional().default(2),
    /** Unix timestamp of the KYC verification event */
    verifiedAt: z.coerce.number().optional(),
  }),
  timestamp: z.coerce.number().optional(),
});

export type FireblocksWebhookPayload = z.infer<typeof FireblocksWebhookSchema>;

// ── KYC Event (normalized internal representation) ──────────────────────

export interface KycEvent {
  /** Event ID for deduplication */
  eventId: string;
  /** Solana wallet address (base58) */
  wallet: string;
  /** KYC status from Fireblocks */
  status: "APPROVED" | "REJECTED" | "PENDING" | "EXPIRED" | "REVOKED";
  /** ISO 3166-1 alpha-2 jurisdiction code */
  jurisdiction: string;
  /** Institutional tier: 1=retail, 2=institutional, 3=prime */
  tier: number;
  /** Unix timestamp when KYC was verified */
  verifiedAt: number;
  /** Unix timestamp when KYC record expires (default: +365 days) */
  expiresAt: number;
  /** When this event was received by the oracle */
  receivedAt: number;
  /** Number of sync attempts */
  attempts: number;
  /** Whether this event has been successfully synced on-chain */
  synced: boolean;
}

// ── Whitelist Audit Log Entry ───────────────────────────────────────────

export interface WhitelistLogEntry {
  event: "whitelist_synced" | "whitelist_revoked" | "whitelist_error";
  wallet: string;
  jurisdiction: string;
  tier: number;
  /** Solana transaction signature (null if mock mode or error) */
  tx: string | null;
  /** Unix timestamp */
  ts: number;
  /** Additional context for errors */
  error?: string;
}

// ── On-chain WalletRecord PDA (mirrors Rust struct) ─────────────────────

export interface WalletRecordData {
  /** Wallet pubkey (base58) */
  wallet: string;
  /** ISO 3166-1 alpha-2 jurisdiction code */
  jurisdiction: string;
  /** Institutional tier 1-3 */
  tier: number;
  /** Unix timestamp of verification */
  verifiedAt: number;
  /** Unix timestamp of expiry */
  expiresAt: number;
  /** Whether the wallet is sanctioned */
  isSanctioned: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────

/** Default KYC record TTL: 365 days in seconds */
export const KYC_EXPIRY_SECONDS = 365 * 24 * 60 * 60;

/** PDA seed prefix for wallet records */
export const WALLET_RECORD_SEED = "wallet-record";
