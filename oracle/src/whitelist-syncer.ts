/**
 * VaultGate Oracle — Whitelist Syncer
 *
 * Writes verified wallet addresses to the on-chain AccessRegistry PDA.
 * Uses the ORACLE_KEYPAIR (non-upgrade authority) for signing.
 *
 * Per AGENTS.md:
 * - "writes verified addresses to access-registry PDA"
 * - "Uses only the ORACLE_KEYPAIR (non-upgrade authority) for signing whitelist writes"
 * - "Never stores raw KYC data"
 *
 * Per SKILLS.md PDA schema:
 * - Seeds: ["wallet-record", wallet_pubkey]
 * - Fields: wallet, jurisdiction, tier, verified_at, expires_at, is_sanctioned, bump
 */

import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getConfig } from "./config.js";
import { getLogger } from "./logger.js";
import {
  getAnchorProgram,
  getOracleKeypair,
  deriveWalletRecordPda,
} from "./anchor-client.js";
import {
  logWhitelistSynced,
  logWhitelistRevoked,
  logWhitelistError,
} from "./logger.js";
import type { KycEvent } from "./types.js";

/**
 * Sync a verified wallet to the on-chain AccessRegistry.
 *
 * Creates or updates the WalletRecord PDA for the given wallet.
 * Returns the transaction signature on success.
 */
export async function syncWalletToChain(event: KycEvent): Promise<string> {
  const config = getConfig();
  const logger = getLogger();
  const wallet = new PublicKey(event.wallet);

  logger.info(
    {
      wallet: event.wallet,
      jurisdiction: event.jurisdiction,
      tier: event.tier,
    },
    "Syncing wallet to chain"
  );

  // ── Mock mode: simulate on-chain write ────────────────────────────
  if (config.MOCK_MODE) {
    const mockTx = `mock_tx_${Date.now()}_${event.wallet.slice(0, 8)}`;
    logger.info({ tx: mockTx, wallet: event.wallet }, "Mock on-chain sync");
    logWhitelistSynced(event.wallet, event.jurisdiction, event.tier, mockTx);
    return mockTx;
  }

  // ── Real on-chain write ────────────────────────────────────────────
  try {
    const { program } = getAnchorProgram();
    const oracleKeypair = getOracleKeypair();
    const [walletRecordPda] = deriveWalletRecordPda(wallet);

    const jurisdictionBytes = Buffer.alloc(2);
    jurisdictionBytes.write(event.jurisdiction.slice(0, 2), "utf-8");

    const tx = await program.methods
      .upsertWalletRecord({
        jurisdiction: Array.from(jurisdictionBytes),
        tier: event.tier,
        expiresAt: event.expiresAt,
        isSanctioned: false,
      })
      .accounts({
        walletRecord: walletRecordPda,
        wallet: wallet,
        oracle: oracleKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair])
      .rpc();

    logger.info(
      { tx, wallet: event.wallet },
      "Wallet synced to on-chain whitelist"
    );

    logWhitelistSynced(event.wallet, event.jurisdiction, event.tier, tx);
    return tx;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, wallet: event.wallet },
      "Failed to sync wallet to chain"
    );
    logWhitelistError(event.wallet, event.jurisdiction, event.tier, errorMsg);
    throw err;
  }
}

/**
 * Revoke a wallet's whitelist status on-chain.
 *
 * Sets is_sanctioned = true on the WalletRecord PDA rather than
 * deleting the account. This preserves the audit trail.
 */
export async function revokeWallet(
  walletAddress: string,
  jurisdiction: string,
  tier: number
): Promise<string> {
  const config = getConfig();
  const logger = getLogger();
  const wallet = new PublicKey(walletAddress);

  logger.info({ wallet: walletAddress }, "Revoking wallet whitelist status");

  // ── Mock mode ─────────────────────────────────────────────────────
  if (config.MOCK_MODE) {
    const mockTx = `mock_revoke_${Date.now()}_${walletAddress.slice(0, 8)}`;
    logger.info({ tx: mockTx, wallet: walletAddress }, "Mock revocation");
    logWhitelistRevoked(walletAddress, jurisdiction, tier, mockTx);
    return mockTx;
  }

  // ── Real on-chain revocation ──────────────────────────────────────
  try {
    const { program } = getAnchorProgram();
    const oracleKeypair = getOracleKeypair();
    const [walletRecordPda] = deriveWalletRecordPda(wallet);

    const tx = await program.methods
      .revokeWalletRecord()
      .accounts({
        walletRecord: walletRecordPda,
        oracle: oracleKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([oracleKeypair])
      .rpc();

    logger.info(
      { tx, wallet: walletAddress },
      "Wallet revoked on-chain"
    );

    logWhitelistRevoked(walletAddress, jurisdiction, tier, tx);
    return tx;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, wallet: walletAddress },
      "Failed to revoke wallet on-chain"
    );
    logWhitelistError(walletAddress, jurisdiction, tier, errorMsg);
    throw err;
  }
}
