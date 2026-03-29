# SKILLS.md — VaultGate

> Reusable patterns, conventions, and hard-won knowledge for building VaultGate.
> Agents must consult this before implementing any pattern listed here.

---

## Solana / Anchor skills

### Skill: Token Extensions Transfer Hook

The Transfer Hook is the core compliance primitive. Every USDC/EURC transfer into or out
of the vault passes through our hook program, which checks the sender against the
`AccessRegistry` PDA whitelist.

**Program structure:**
```rust
// programs/kyc-hook/src/lib.rs
use anchor_lang::prelude::*;
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

declare_id!("HookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod kyc_hook {
    use super::*;

    // Called by Token Extensions runtime on every transfer
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        let registry = &ctx.accounts.access_registry;
        let sender = ctx.accounts.source_authority.key();

        require!(
            registry.is_whitelisted(&sender),
            VaultError::NotKycVerified
        );
        require!(
            !registry.is_sanctioned(&sender),
            VaultError::SanctionedAddress
        );
        require!(
            registry.jurisdiction_allowed(&sender, &ctx.accounts.vault.allowed_jurisdictions),
            VaultError::JurisdictionNotAllowed
        );

        emit!(TransferChecked {
            wallet: sender,
            amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    // Required by SPL Transfer Hook interface — called on account initialization
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        // Register the AccessRegistry PDA as extra required account
        // so Token Extensions runtime passes it on every transfer
        let account_metas = vec![
            ExtraAccountMeta::new_with_seeds(
                &[b"access-registry", ctx.accounts.vault.key().as_ref()],
                false, // is_signer
                false, // is_writable
            )?,
        ];
        // ... write to extra account meta list PDA
        Ok(())
    }
}
```

**Key gotcha:** The hook program must be deployed BEFORE the mint is created with the
`TransferHook` extension. Order: deploy hook → create mint with hook extension → create vault.

**Testing the hook:**
```typescript
// Use spl-token-2022 test helpers — not legacy spl-token
import { createMintWithTransferHook } from "@solana/spl-token";

const mint = await createMintWithTransferHook(
  connection, payer, mintAuthority, null, 6,
  HOOK_PROGRAM_ID, [], TOKEN_2022_PROGRAM_ID
);
```

---

### Skill: PDA design pattern for AccessRegistry

All KYC state lives in PDAs seeded by wallet address. This allows O(1) lookup during
the Transfer Hook without iterating a list.

```rust
// One PDA per verified wallet
#[account]
pub struct WalletRecord {
    pub wallet: Pubkey,           // 32
    pub jurisdiction: [u8; 2],   // 2  (ISO 3166-1 alpha-2, e.g. b"CH")
    pub tier: u8,                 // 1  (1=retail, 2=institutional, 3=prime)
    pub verified_at: i64,         // 8
    pub expires_at: i64,          // 8
    pub is_sanctioned: bool,      // 1
    pub bump: u8,                 // 1
}
// Total: 53 bytes + 8 discriminator = 61 bytes per record

// Seeds: ["wallet-record", wallet_pubkey]
// Finding: Pubkey::find_program_address(&[b"wallet-record", wallet.as_ref()], &PROGRAM_ID)
```

**Oracle writes this PDA.** The vault program reads it. They share the same program ID
(the `access-registry` program) so both can derive the same PDA deterministically.

---

### Skill: Vault deposit flow

```rust
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = !vault.is_paused @ VaultError::VaultPaused,
        constraint = vault.total_deposits + amount <= vault.deposit_cap @ VaultError::CapExceeded,
    )]
    pub vault: Account<'info, VaultState>,

    // depositor's token account (must use Token Extensions program)
    #[account(
        mut,
        token::mint = vault.accepted_mint,
        token::authority = depositor,
        token::token_program = token_program,
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    // vault's token account
    #[account(
        mut,
        token::mint = vault.accepted_mint,
        token::authority = vault,
        token::token_program = token_program,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
```

**Use `InterfaceAccount` and `Interface` — not `Account<TokenAccount>`.** The legacy
types reject Token 2022 mints and will cause subtle account validation failures.

---

### Skill: Yield routing to Kamino

Kamino uses a reserve-based lending model. VaultGate deposits to a Kamino reserve and
holds kTokens (receipt tokens) representing the deposited + accrued amount.

```typescript
// Simplified Kamino deposit via CPI
// Full SDK: @kamino-finance/klend-sdk
import { KaminoMarket, KaminoAction } from "@kamino-finance/klend-sdk";

const market = await KaminoMarket.load(connection, KAMINO_MARKET_ADDRESS);
const depositAction = await KaminoAction.buildDepositTxns(
  market,
  vaultKeypair.publicKey,
  "USDC",
  amount,
  new VanillaObligation(PROGRAM_ID)
);
```

For the hackathon, if Kamino devnet is unavailable: use a **mock yield accumulator**
in the vault program itself (accrues a fixed APY rate per slot). Flag this clearly in
the demo as "Kamino integration ready; using simulated yield for devnet demo."

---

### Skill: Error handling pattern

```rust
#[error_code]
pub enum VaultError {
    #[msg("Wallet is not KYC verified in the access registry")]
    NotKycVerified,
    #[msg("Wallet address is on a sanctions list")]
    SanctionedAddress,
    #[msg("Wallet jurisdiction is not permitted for this vault")]
    JurisdictionNotAllowed,
    #[msg("Vault deposit cap would be exceeded")]
    CapExceeded,
    #[msg("Vault is paused by admin")]
    VaultPaused,
    #[msg("KYC record has expired — re-verification required")]
    KycExpired,
    #[msg("Amount below minimum deposit threshold")]
    BelowMinimum,
}
```

Always use named error codes — never `require!(condition)` without a VaultError variant.
This makes the frontend able to display human-readable messages.

---

## Oracle service skills

### Skill: Fireblocks webhook verification

Fireblocks signs webhook payloads with an ECDSA key. Always verify before processing.

```typescript
// oracle/src/webhooks.ts
import { createVerify } from "crypto";
import { FIREBLOCKS_PUBLIC_KEY } from "./config";

export function verifyFireblocksWebhook(
  payload: string,
  signature: string
): boolean {
  const verify = createVerify("SHA512");
  verify.update(payload);
  try {
    return verify.verify(FIREBLOCKS_PUBLIC_KEY, signature, "base64");
  } catch {
    return false;
  }
}

// Fastify route
fastify.post("/webhook/fireblocks", {
  config: { rawBody: true } // need raw body for signature verification
}, async (req, reply) => {
  const sig = req.headers["fireblocks-signature"] as string;
  if (!verifyFireblocksWebhook(req.rawBody, sig)) {
    return reply.code(401).send({ error: "invalid signature" });
  }
  await processKycEvent(req.body);
  return reply.code(200).send({ ok: true });
});
```

### Skill: Writing to the on-chain whitelist

```typescript
// oracle/src/whitelist-syncer.ts
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

export async function syncWalletToChain(
  program: Program<AccessRegistry>,
  wallet: PublicKey,
  jurisdiction: string,
  tier: number,
  expiresAt: Date
): Promise<string> {
  const [walletRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("wallet-record"), wallet.toBuffer()],
    program.programId
  );

  const tx = await program.methods
    .upsertWalletRecord({
      jurisdiction: Buffer.from(jurisdiction.slice(0, 2)),
      tier,
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
      isSanctioned: false,
    })
    .accounts({
      walletRecord: walletRecordPda,
      wallet,
      oracle: oracleKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([oracleKeypair])
    .rpc();

  console.log(JSON.stringify({
    event: "whitelist_synced",
    wallet: wallet.toBase58(),
    jurisdiction,
    tier,
    tx,
    ts: Date.now()
  }));

  return tx;
}
```

### Skill: Circuit breaker for Fireblocks API

```typescript
// oracle/src/fireblocks.ts
import FireblocksSDK from "fireblocks-sdk";
import pRetry from "p-retry";

const fb = new FireblocksSDK(API_SECRET, API_KEY);

export async function getWalletKycStatus(walletId: string) {
  return pRetry(
    async () => {
      const result = await fb.getExternalWallet(walletId);
      if (!result) throw new Error("empty response");
      return result;
    },
    {
      retries: 3,
      factor: 2,
      minTimeout: 500,
      onFailedAttempt: (err) => {
        console.warn(`Fireblocks attempt ${err.attemptNumber} failed: ${err.message}`);
      }
    }
  );
}
```

---

## Frontend skills

### Skill: Reading vault state with Anchor client

```typescript
// app/hooks/useVaultState.ts
import { useAnchorProgram } from "./useAnchorProgram";
import { PublicKey } from "@solana/web3.js";
import useSWR from "swr";

export function useVaultState(vaultAddress: PublicKey) {
  const program = useAnchorProgram();

  return useSWR(
    ["vault", vaultAddress.toBase58()],
    async () => {
      const vault = await program.account.vaultState.fetch(vaultAddress);
      return {
        totalDeposits: vault.totalDeposits.toNumber() / 1e6, // USDC decimals
        depositCap: vault.depositCap.toNumber() / 1e6,
        currentApy: vault.currentApy / 100, // basis points → percentage
        isPaused: vault.isPaused,
        allowedJurisdictions: vault.allowedJurisdictions,
      };
    },
    { refreshInterval: 10_000 } // poll every 10s
  );
}
```

### Skill: KYC status check before deposit

```typescript
// app/hooks/useKycStatus.ts
export function useKycStatus(wallet: PublicKey | null) {
  const program = useAnchorProgram();

  return useSWR(
    wallet ? ["kyc", wallet.toBase58()] : null,
    async () => {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("wallet-record"), wallet!.toBuffer()],
        ACCESS_REGISTRY_PROGRAM_ID
      );
      try {
        const record = await program.account.walletRecord.fetch(pda);
        const isExpired = record.expiresAt.toNumber() < Date.now() / 1000;
        return {
          verified: !isExpired,
          jurisdiction: Buffer.from(record.jurisdiction).toString(),
          tier: record.tier,
          expiresAt: new Date(record.expiresAt.toNumber() * 1000),
        };
      } catch {
        return { verified: false };
      }
    }
  );
}
```

### Skill: Demo mode for Zurich

Wrap all data-fetching hooks with a demo mode shim so the UI works without a live validator:

```typescript
// app/lib/demo.ts
export const DEMO_VAULT_STATE = {
  totalDeposits: 2_500_000,
  depositCap: 10_000_000,
  currentApy: 6.8,
  isPaused: false,
};

export const DEMO_KYC_STATUS = {
  verified: true,
  jurisdiction: "CH",
  tier: 2,
  expiresAt: new Date("2026-12-31"),
};

// In hooks: if (process.env.NEXT_PUBLIC_DEMO_MODE) return DEMO_VAULT_STATE
```

---

## Testing skills

### Skill: Anchor test pattern with Bankrun

```typescript
// tests/vault-deposit.test.ts
import { startAnchor, ProgramTestContext } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";

describe("VaultGate deposit", () => {
  let context: ProgramTestContext;

  before(async () => {
    context = await startAnchor(".", [
      { name: "vault_core", programId: VAULT_PROGRAM_ID },
      { name: "kyc_hook", programId: HOOK_PROGRAM_ID },
    ], []);
  });

  it("rejects non-whitelisted depositor", async () => {
    const badWallet = Keypair.generate();
    // Don't add to whitelist
    try {
      await depositToVault(badWallet, 1_000_000);
      assert.fail("should have thrown");
    } catch (e) {
      assert.include(e.message, "NotKycVerified");
    }
  });

  it("accepts whitelisted depositor", async () => {
    const goodWallet = Keypair.generate();
    await addToWhitelist(goodWallet.publicKey, "CH", 2);
    const tx = await depositToVault(goodWallet, 1_000_000);
    assert.ok(tx);
  });
});
```

---

## Environment variables reference

```bash
# .env.example — copy to .env, fill in real values, never commit .env

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
VAULT_PROGRAM_ID=
HOOK_PROGRAM_ID=
ACCESS_REGISTRY_PROGRAM_ID=

# Oracle keypair (base58 — use a burner for dev)
ORACLE_KEYPAIR=

# Fireblocks
FIREBLOCKS_API_KEY=
FIREBLOCKS_API_SECRET_PATH=./fireblocks_secret.key
FIREBLOCKS_PUBLIC_KEY=       # for webhook signature verification
FIREBLOCKS_BASE_URL=https://api.fireblocks.io

# Frontend
NEXT_PUBLIC_CLUSTER=devnet
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_VAULT_ADDRESS=
NEXT_PUBLIC_ACCESS_REGISTRY_PROGRAM_ID=
```
