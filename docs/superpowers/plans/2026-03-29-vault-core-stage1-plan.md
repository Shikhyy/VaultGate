# Vault Core Implementation Plan — Stage 1 (Access Registry)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the pristine Anchor workspace for VaultGate and implement the first fundamental layer: the `access-registry` program which stores on-chain KYC state in WalletRecord PDAs.

**Architecture:** Standard Anchor layout. The `access-registry` relies on a `RegistryConfig` PDA to define the oracle authority, and `WalletRecord` PDAs seeded by `["wallet-record", pubkey]` to store individual KYC data.

**Tech Stack:** Anchor Framework (0.30.1+), Rust, Solana, spl-token-2022, Bankrun for testing.

---

### Task 1: Initialize Anchor Workspace & Access Registry Scaffold 

**Files:**
- Create: `Anchor.toml`
- Create: `package.json`
- Create: `programs/access-registry/src/lib.rs`
- Create: `tests/access-registry.test.ts`

- [ ] **Step 1: Initialize workspace and install dependencies**
Run: 
```bash
anchor init vault_core --javascript
mv vault_core/* .
mv vault_core/.gitignore .
rm -rf vault_core
yarn add -D solana-bankrun anchor-bankrun
```
Expected: Standard Anchor directory structure created in the root.

- [ ] **Step 2: Rename default program to access-registry**
Modify `Anchor.toml`:
```toml
[toolchain]

[features]
resolution = true
skip-lint = false

[programs.localnet]
access_registry = "AccessRegistry111111111111111111111111111"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```
Rename directory `programs/vault_core` to `programs/access-registry`.
Rename `programs/access-registry/src/lib.rs` to declare `access_registry`.

- [ ] **Step 3: Verify build**
Run: `anchor build`
Expected: PASS. Build succeeds and generates `target/idl/access_registry.json`.

- [ ] **Step 4: Commit**
```bash
git add .
git commit -m "chore: scaffold anchor workspace and access-registry program"
```

---

### Task 2: Access Registry State & Errors

**Files:**
- Create: `programs/access-registry/src/state.rs`
- Create: `programs/access-registry/src/error.rs`
- Modify: `programs/access-registry/src/lib.rs`

- [ ] **Step 1: Write state definitions**
Create `programs/access-registry/src/state.rs`:
```rust
use anchor_lang::prelude::*;

#[account]
pub struct RegistryConfig {
    pub oracle_authority: Pubkey,
    pub admin: Pubkey,
    pub total_records: u64,
    pub bump: u8,
}
impl RegistryConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct WalletRecord {
    pub wallet: Pubkey,
    pub jurisdiction: [u8; 2],
    pub tier: u8,
    pub verified_at: i64,
    pub expires_at: i64,
    pub is_sanctioned: bool,
    pub bump: u8,
}
impl WalletRecord {
    pub const SPACE: usize = 8 + 32 + 2 + 1 + 8 + 8 + 1 + 1;
}
```

- [ ] **Step 2: Write error codes**
Create `programs/access-registry/src/error.rs`:
```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum VaultError {
    #[msg("Unauthorized — not the oracle authority")]
    UnauthorizedOracle,
    #[msg("Unauthorized — not the admin")]
    UnauthorizedAdmin,
}
```

- [ ] **Step 3: Export from lib.rs**
Modify `programs/access-registry/src/lib.rs`:
```rust
use anchor_lang::prelude::*;

pub mod error;
pub mod state;

use error::*;
use state::*;

declare_id!("AccessRegistry111111111111111111111111111");

#[program]
pub mod access_registry {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
```

- [ ] **Step 4: Verify build**
Run: `anchor build`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add programs/access-registry/src/
git commit -m "feat(registry): add state and error definitions"
```

---

### Task 3: Initialize Registry Config

**Files:**
- Modify: `programs/access-registry/src/lib.rs`
- Modify: `tests/access-registry.test.ts`

- [ ] **Step 1: Write failing test**
Create `tests/access-registry.ts`:
```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AccessRegistry } from "../target/types/access_registry";
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { PublicKey, Keypair } from "@solana/web3.js";
import { assert } from "chai";

describe("access_registry", () => {
  it("Initializes the config", async () => {
    const context = await startAnchor("", [{ name: "access_registry", programId: new PublicKey("AccessRegistry111111111111111111111111111")} ], []);
    const provider = new BankrunProvider(context);
    const idl = await anchor.Program.fetchIdl("AccessRegistry111111111111111111111111111", provider);
    const program = new anchor.Program(idl!, provider) as Program<AccessRegistry>;
    
    const admin = provider.wallet.publicKey;
    const oracle = Keypair.generate().publicKey;
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("registry-config")], program.programId);
    
    await program.methods.initialize(oracle).accounts({
      config: configPda,
      admin: admin,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc();
    
    const config = await program.account.registryConfig.fetch(configPda);
    assert.ok(config.oracleAuthority.equals(oracle));
    assert.ok(config.admin.equals(admin));
  });
});
```

- [ ] **Step 2: Run test (fails)**
Run: `anchor test`
Expected: FAIL - Initialize instruction takes no arguments in the current program.

- [ ] **Step 3: Implement initialize**
Modify `programs/access-registry/src/lib.rs`:
```rust
use anchor_lang::prelude::*;

pub mod error;
pub mod state;

use error::*;
use state::*;

declare_id!("AccessRegistry111111111111111111111111111");

#[program]
pub mod access_registry {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, oracle_authority: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.oracle_authority = oracle_authority;
        config.total_records = 0;
        config.bump = ctx.bumps.config;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = RegistryConfig::SPACE,
        seeds = [b"registry-config"],
        bump
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 4: Run test (passes)**
Run: `anchor test`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add .
git commit -m "feat(registry): implement initialize config instruction"
```

---

### Task 4: Upsert Wallet Record

**Files:**
- Modify: `programs/access-registry/src/lib.rs`
- Modify: `tests/access-registry.test.ts`

- [ ] **Step 1: Write failing test**
Modify `tests/access-registry.ts` to add a new test:
```typescript
  it("Upserts a wallet record", async () => {
    // Note: requires setting up the provider and config as in previous test
    // For brevity, assume setup exists.
    const context = await startAnchor("", [{ name: "access_registry", programId: new PublicKey("AccessRegistry111111111111111111111111111")} ], []);
    const provider = new BankrunProvider(context);
    const idl = await anchor.Program.fetchIdl("AccessRegistry111111111111111111111111111", provider);
    const program = new anchor.Program(idl!, provider) as Program<AccessRegistry>;
    
    const admin = provider.wallet.publicKey;
    const oracle = Keypair.generate();
    const targetWallet = Keypair.generate().publicKey;
    
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("registry-config")], program.programId);
    await program.methods.initialize(oracle.publicKey).accounts({
      config: configPda,
      admin: admin,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).rpc();
    
    const [recordPda] = PublicKey.findProgramAddressSync([Buffer.from("wallet-record"), targetWallet.toBuffer()], program.programId);
    
    const jurisdiction = Array.from(Buffer.from("CH"));
    const tier = 2;
    const expiresAt = new anchor.BN(Math.floor(Date.now() / 1000) + 86400); // +1 day
    
    await program.methods.upsertWalletRecord(jurisdiction, tier, expiresAt, false).accounts({
      config: configPda,
      walletRecord: recordPda,
      wallet: targetWallet,
      oracle: oracle.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([oracle]).rpc();
    
    const record = await program.account.walletRecord.fetch(recordPda);
    assert.ok(record.wallet.equals(targetWallet));
    assert.equal(Buffer.from(record.jurisdiction).toString(), "CH");
    assert.equal(record.tier, 2);
    assert.equal(record.isSanctioned, false);
  });
```

- [ ] **Step 2: Implement upsert_wallet_record**
Modify `programs/access-registry/src/lib.rs`:
```rust
// Inside the access_registry mod:
    pub fn upsert_wallet_record(
        ctx: Context<UpsertWalletRecord>,
        jurisdiction: [u8; 2],
        tier: u8,
        expires_at: i64,
        is_sanctioned: bool,
    ) -> Result<()> {
        let record = &mut ctx.accounts.wallet_record;
        record.wallet = ctx.accounts.wallet.key();
        record.jurisdiction = jurisdiction;
        record.tier = tier;
        record.verified_at = Clock::get()?.unix_timestamp;
        record.expires_at = expires_at;
        record.is_sanctioned = is_sanctioned;
        
        if record.bump == 0 {
            record.bump = ctx.bumps.wallet_record;
            ctx.accounts.config.total_records = ctx.accounts.config.total_records.checked_add(1).unwrap();
        }
        Ok(())
    }

// Below the mod:
#[derive(Accounts)]
pub struct UpsertWalletRecord<'info> {
    #[account(
        mut,
        has_one = oracle_authority @ VaultError::UnauthorizedOracle
    )]
    pub config: Account<'info, RegistryConfig>,
    
    #[account(
        init_if_needed,
        payer = oracle,
        space = WalletRecord::SPACE,
        seeds = [b"wallet-record", wallet.key().as_ref()],
        bump
    )]
    pub wallet_record: Account<'info, WalletRecord>,
    
    /// CHECK: The wallet this record is for. We don't read/write state, just use its key for seeds
    pub wallet: AccountInfo<'info>,
    
    #[account(mut)]
    pub oracle: Signer<'info>,
    
    /// CHECK: Validated by constraint in config
    pub oracle_authority: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}
```

- [ ] **Step 3: Run test**
Run: `anchor test`
Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add .
git commit -m "feat(registry): implement upsert_wallet_record"
```
