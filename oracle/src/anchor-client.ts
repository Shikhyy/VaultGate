/**
 * VaultGate Oracle — Anchor Client
 *
 * Initializes the Solana connection, Anchor provider, and AccessRegistry
 * program client. Loads the oracle keypair for signing whitelist writes.
 *
 * In MOCK_MODE, provides a mock program that simulates on-chain writes.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { getConfig } from "./config.js";
import { getLogger } from "./logger.js";
import { WALLET_RECORD_SEED } from "./types.js";
import bs58 from "bs58";

// ── Stub IDL for AccessRegistry ─────────────────────────────────────────
// This mirrors the PDA schema from SKILLS.md.
// Will be replaced with the real IDL from target/idl/ when Agent 1 deploys.

export const ACCESS_REGISTRY_IDL = {
  version: "0.1.0",
  name: "access_registry",
  instructions: [
    {
      name: "upsertWalletRecord",
      accounts: [
        { name: "walletRecord", isMut: true, isSigner: false },
        { name: "wallet", isMut: false, isSigner: false },
        { name: "oracle", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        {
          name: "params",
          type: {
            defined: "UpsertParams",
          },
        },
      ],
    },
    {
      name: "revokeWalletRecord",
      accounts: [
        { name: "walletRecord", isMut: true, isSigner: false },
        { name: "oracle", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "WalletRecord",
      type: {
        kind: "struct" as const,
        fields: [
          { name: "wallet", type: "publicKey" },
          { name: "jurisdiction", type: { array: ["u8", 2] } },
          { name: "tier", type: "u8" },
          { name: "verifiedAt", type: "i64" },
          { name: "expiresAt", type: "i64" },
          { name: "isSanctioned", type: "bool" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  types: [
    {
      name: "UpsertParams",
      type: {
        kind: "struct" as const,
        fields: [
          { name: "jurisdiction", type: { array: ["u8", 2] } },
          { name: "tier", type: "u8" },
          { name: "expiresAt", type: "i64" },
          { name: "isSanctioned", type: "bool" },
        ],
      },
    },
  ],
} as const;

// ── Client Singleton ────────────────────────────────────────────────────

let _connection: Connection | null = null;
let _oracleKeypair: Keypair | null = null;
let _programId: PublicKey | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    const config = getConfig();
    _connection = new Connection(config.SOLANA_RPC_URL, "confirmed");
    getLogger().info(
      { rpc: config.SOLANA_RPC_URL },
      "Solana connection established"
    );
  }
  return _connection;
}

export function getOracleKeypair(): Keypair {
  if (!_oracleKeypair) {
    const config = getConfig();
    if (!config.ORACLE_KEYPAIR) {
      getLogger().warn("No ORACLE_KEYPAIR set — using random keypair (dev only)");
      _oracleKeypair = Keypair.generate();
    } else {
      try {
        // Try base58 first
        const decoded = bs58.decode(config.ORACLE_KEYPAIR);
        _oracleKeypair = Keypair.fromSecretKey(decoded);
      } catch {
        // Try JSON array format
        try {
          const arr = JSON.parse(config.ORACLE_KEYPAIR);
          _oracleKeypair = Keypair.fromSecretKey(Uint8Array.from(arr));
        } catch {
          getLogger().error("Invalid ORACLE_KEYPAIR format — expected base58 or JSON array");
          _oracleKeypair = Keypair.generate();
        }
      }
    }
    getLogger().info(
      { oracle: _oracleKeypair.publicKey.toBase58() },
      "Oracle keypair loaded"
    );
  }
  return _oracleKeypair;
}

export function getProgramId(): PublicKey {
  if (!_programId) {
    const config = getConfig();
    _programId = new PublicKey(config.ACCESS_REGISTRY_PROGRAM_ID);
  }
  return _programId;
}

/**
 * Derive the WalletRecord PDA for a given wallet address.
 * Seeds: ["wallet-record", wallet_pubkey]
 */
export function deriveWalletRecordPda(
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(WALLET_RECORD_SEED), wallet.toBuffer()],
    getProgramId()
  );
}

/**
 * Get the Anchor provider and program.
 * In a full integration, this would return a typed Program<AccessRegistry>.
 * For now, returns a generic Program using the stub IDL.
 */
export function getAnchorProgram(): {
  provider: anchor.AnchorProvider;
  program: anchor.Program;
} {
  const connection = getConnection();
  const oracleKeypair = getOracleKeypair();

  const wallet = new anchor.Wallet(oracleKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });

  const program = new anchor.Program(
    ACCESS_REGISTRY_IDL as unknown as anchor.Idl,
    provider
  );

  return { provider, program };
}

/** Reset cached clients — used in tests */
export function resetClients(): void {
  _connection = null;
  _oracleKeypair = null;
  _programId = null;
}
