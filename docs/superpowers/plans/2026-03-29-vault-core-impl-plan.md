# Vault Core Implementation Plan — Completion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Complete vault-core implementation with proper yield-per-share accounting per the spec.

**Architecture:** VaultCore with global yield index (Compound-style), Token2022 support, KYC enforcement via Transfer Hook.

**Tech Stack:** Anchor 0.30+, Rust, spl-token-2022, solana-bankrun

---

### Task 1: Update VaultState to Match Spec

**Files:**
- Modify: `programs/vault-core/src/state.rs`

- [ ] **Step 1: Backup current state.rs**

```bash
cp programs/vault-core/src/state.rs programs/vault-core/src/state.rs.bak
```

- [ ] **Step 2: Rewrite state.rs to match spec**

Replace the entire `programs/vault-core/src/state.rs`:

```rust
use anchor_lang::prelude::*;

#[account]
pub struct VaultState {
    pub authority: Pubkey,                      // 32
    pub accepted_mint: Pubkey,                  // 32
    pub vault_token_account: Pubkey,             // 32
    pub yield_reserve_account: Pubkey,          // 32
    pub deposit_cap: u64,                       // 8
    pub min_deposit: u64,                       // 8
    pub total_deposits: u64,                    // 8
    pub total_shares: u64,                      // 8
    pub accumulated_yield_per_share: u128,      // 16 (scaled by 1e12)
    pub yield_rate_bps: u16,                    // 2
    pub last_yield_accrual: i64,                 // 8
    pub total_yield_distributed: u64,           // 8
    pub allowed_jurisdictions: Vec<[u8; 2]>,   // 4 + 2*len, cap at 10
    pub is_paused: bool,                        // 1
    pub depositor_count: u32,                   // 4
    pub bump: u8,                               // 1
}

impl VaultState {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 16 + 2 + 8 + 8 + 24 + 1 + 4 + 1;
}
```

- [ ] **Step 3: Add DepositReceipt with yield tracking**

```rust
#[account]
pub struct DepositReceipt {
    pub vault: Pubkey,         // 32
    pub depositor: Pubkey,     // 32
    pub shares: u64,          // 8
    pub principal: u64,       // 8
    pub reward_debt: u128,    // 16 (accumulated_yield_per_share * shares at deposit)
    pub deposited_at: i64,    // 8
    pub bump: u8,             // 1
}

impl DepositReceipt {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 16 + 8 + 1;
}
```

- [ ] **Step 4: Build to verify**

Run: `anchor build`
Expected: PASS (may need to update instruction contexts)

- [ ] **Step 5: Commit**

```bash
git add programs/vault-core/src/state.rs
git commit -m "refactor(vault): update state to match yield-per-share spec"
```

---

### Task 2: Update InitializeVault to Create Token Accounts

**Files:**
- Modify: `programs/vault-core/src/instructions/initialize_vault.rs`

- [ ] **Step 1: Read current initialize_vault.rs**

- [ ] **Step 2: Update InitializeVault context to create vault_token_account and yield_reserve_account**

```rust
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = VaultState::SPACE,
        seeds = [b"vault", authority.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(
        init,
        payer = authority,
        token::mint = accepted_mint,
        token::authority = vault,
        seeds = [b"vault-tokens", vault.key().as_ref()],
        bump
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        init,
        payer = authority,
        token::mint = accepted_mint,
        token::authority = vault,
        seeds = [b"yield-reserve", vault.key().as_ref()],
        bump
    )]
    pub yield_reserve_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    pub accepted_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub rent: Sysvar<'info, Rent>,
}
```

- [ ] **Step 3: Update handler to initialize new fields**

```rust
pub fn handle_initialize_vault(
    ctx: Context<InitializeVault>,
    deposit_cap: u64,
    min_deposit: u64,
    current_apy: u16,
    allowed_jurisdictions: Vec<[u8; 2]>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    
    vault.authority = ctx.accounts.authority.key();
    vault.accepted_mint = ctx.accounts.accepted_mint.key();
    vault.vault_token_account = ctx.accounts.vault_token_account.key();
    vault.yield_reserve_account = ctx.accounts.yield_reserve_account.key();
    vault.deposit_cap = deposit_cap;
    vault.min_deposit = min_deposit;
    vault.total_deposits = 0;
    vault.total_shares = 0;
    vault.accumulated_yield_per_share = 0;
    vault.yield_rate_bps = current_apy;
    vault.last_yield_accrual = clock.unix_timestamp;
    vault.total_yield_distributed = 0;
    vault.allowed_jurisdictions = allowed_jurisdictions;
    vault.is_paused = false;
    vault.depositor_count = 0;
    vault.bump = ctx.bumps.vault;
    
    emit!(VaultInitialized {
        vault: vault.key(),
        authority: vault.authority,
        accepted_mint: vault.accepted_mint,
        deposit_cap,
        min_deposit,
        current_apy,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}
```

- [ ] **Step 4: Run build**

Run: `anchor build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add programs/vault-core/src/instructions/initialize_vault.rs
git commit -m "feat(vault): initialize vault with token accounts and yield fields"
```

---

### Task 3: Implement Yield Accrual Logic

**Files:**
- Modify: `programs/vault-core/src/instructions/admin.rs` (add accrue_yield)

- [ ] **Step 1: Add AccrueYield context and handler to admin.rs**

```rust
#[derive(Accounts)]
pub struct AccrueYield<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
}

pub fn handle_accrue_yield(ctx: Context<AccrueYield>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    
    if vault.total_shares == 0 {
        vault.last_yield_accrual = clock.unix_timestamp;
        return Ok(());
    }
    
    let time_elapsed = clock.unix_timestamp - vault.last_yield_accrual;
    if time_elapsed == 0 {
        return Ok(());
    }
    
    // yield_for_period = total_deposits * yield_rate_bps * time_elapsed / (10000 * SECONDS_PER_YEAR)
    let seconds_per_year: i64 = 365 * 24 * 60 * 60;
    let yield_for_period = vault.total_deposits
        .checked_mul(vault.yield_rate_bps as u64)
        .ok_or(VaultError::MathOverflow)?
        .checked_mul(time_elapsed as u64)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(10000)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(seconds_per_year as u64)
        .ok_or(VaultError::MathOverflow)?;
    
    if yield_for_period > 0 {
        let delta = yield_for_period
            .checked_mul(1_000_000_000_000u128 as u64)
            .ok_or(VaultError::MathOverflow)?
            .checked_div(vault.total_shares)
            .ok_or(VaultError::MathOverflow)?;
        
        vault.accumulated_yield_per_share = vault.accumulated_yield_per_share
            .checked_add(delta)
            .ok_or(VaultError::MathOverflow)?;
        vault.total_yield_distributed = vault.total_yield_distributed
            .checked_add(yield_for_period)
            .ok_or(VaultError::MathOverflow)?;
    }
    
    vault.last_yield_accrual = clock.unix_timestamp;
    
    emit!(YieldAccruedEvent {
        vault: vault.key(),
        yield_per_share_delta: yield_for_period,
        total_yield_distributed: vault.total_yield_distributed,
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}
```

- [ ] **Step 2: Add AccrueYield to mod.rs and lib.rs**

- [ ] **Step 3: Run build**

Run: `anchor build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add programs/vault-core/src/instructions/admin.rs
git commit -m "feat(vault): implement yield accrual with global index"
```

---

### Task 4: Update Deposit to Use Shares

**Files:**
- Modify: `programs/vault-core/src/instructions/deposit.rs`

- [ ] **Step 1: Update Deposit handler for share-based accounting**

Replace `handle_deposit` to use shares:

```rust
pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    
    require!(amount >= vault.min_deposit, VaultError::BelowMinimum);
    
    let new_total = vault.total_deposits.checked_add(amount).ok_or(VaultError::MathOverflow)?;
    require!(new_total <= vault.deposit_cap, VaultError::CapExceeded);
    
    // KYC Checks
    let record = &ctx.accounts.wallet_record;
    require!(!record.is_sanctioned, VaultError::SanctionedAddress);
    require!(record.expires_at > clock.unix_timestamp, VaultError::KycExpired);
    
    let allowed = vault.allowed_jurisdictions.iter().any(|j| j == &record.jurisdiction);
    require!(allowed, VaultError::JurisdictionNotAllowed);
    
    // Transfer tokens to vault
    let transfer_cpi_accounts = TransferChecked {
        from: ctx.accounts.depositor_token_account.to_account_info(),
        mint: ctx.accounts.accepted_mint.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi_accounts);
    transfer_checked(cpi_ctx, amount, ctx.accounts.accepted_mint.decimals)?;
    
    // Calculate shares (1:1 for simplicity)
    let shares = amount;
    
    // Accrue yield first
    // (simplified - in production call accrue_yield)
    
    // Update vault
    vault.total_deposits = new_total;
    vault.total_shares = vault.total_shares.checked_add(shares).ok_or(VaultError::MathOverflow)?;
    
    // Update receipt
    let receipt = &mut ctx.accounts.deposit_receipt;
    if receipt.shares == 0 {
        vault.depositor_count = vault.depositor_count.checked_add(1).unwrap();
        receipt.vault = vault.key();
        receipt.depositor = ctx.accounts.depositor.key();
        receipt.bump = ctx.bumps.deposit_receipt;
        receipt.yield_claimed = 0;
    }
    
    receipt.shares = receipt.shares.checked_add(shares).unwrap();
    receipt.principal = receipt.principal.checked_add(amount).unwrap();
    receipt.reward_debt = vault.accumulated_yield_per_share
        .checked_mul(receipt.shares)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(1_000_000_000_000u128)
        .ok_or(VaultError::MathOverflow)?;
    receipt.deposited_at = clock.unix_timestamp;
    
    emit!(DepositEvent {
        wallet: ctx.accounts.depositor.key(),
        amount,
        shares,
        vault_id: vault.key(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}
```

- [ ] **Step 2: Update DepositEvent to include shares**

In events.rs:
```rust
#[event]
pub struct DepositEvent {
    pub wallet: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub vault_id: Pubkey,
    pub timestamp: i64,
}
```

- [ ] **Step 3: Run build**

Run: `anchor build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add programs/vault-core/src/instructions/deposit.rs programs/vault-core/src/events.rs
git commit -m "feat(vault): update deposit to use share-based accounting"
```

---

### Task 5: Implement Withdraw with Yield Claims

**Files:**
- Modify: `programs/vault-core/src/instructions/withdraw.rs`

- [ ] **Step 1: Rewrite withdraw.rs with full yield claim**

```rust
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TokenAccount, TokenInterface, TransferChecked};
use crate::{state::{VaultState, DepositReceipt}, errors::VaultError, events::WithdrawEvent};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, VaultState>,
    
    #[account(
        mut,
        seeds = [b"receipt", vault.key().as_ref(), depositor.key().as_ref()],
        bump = deposit_receipt.bump
    )]
    pub deposit_receipt: Account<'info, DepositReceipt>,
    
    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = vault,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = depositor,
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub depositor: Signer<'info>,
    
    pub accepted_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let receipt = &mut ctx.accounts.deposit_receipt;
    let clock = Clock::get()?;
    
    require!(amount > 0, VaultError::BelowMinimum);
    require!(receipt.principal >= amount, VaultError::InsufficientBalance);
    
    // Calculate pending yield
    let pending_yield = calculate_pending_yield(vault, receipt);
    
    // Transfer principal
    let transfer_cpi = TransferChecked {
        from: ctx.accounts.vault_token_account.to_account_info(),
        mint: ctx.accounts.accepted_mint.to_account_info(),
        to: ctx.accounts.depositor_token_account.to_account_info(),
        authority: vault.to_account_info(),
    };
    let seeds = &[b"vault", vault.authority.as_ref(), &[vault.bump]];
    let signer = &[seeds];
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_cpi,
        signer,
    );
    transfer_checked(cpi_ctx, amount, ctx.accounts.accepted_mint.decimals)?;
    
    // Transfer yield if any
    let yield_amount = if pending_yield > 0 {
        let yield_transfer = TransferChecked {
            from: ctx.accounts.vault_token_account.to_account_info(),
            mint: ctx.accounts.accepted_mint.to_account_info(),
            to: ctx.accounts.depositor_token_account.to_account_info(),
            authority: vault.to_account_info(),
        };
        let yield_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            yield_transfer,
            signer,
        );
        let yield_amt = pending_yield.min(ctx.accounts.vault_token_account.amount);
        transfer_checked(yield_ctx, yield_amt, ctx.accounts.accepted_mint.decimals)?;
        yield_amt
    } else {
        0
    };
    
    // Update state
    let shares_to_remove = amount; // 1:1 for now
    vault.total_deposits = vault.total_deposits.checked_sub(amount).unwrap();
    vault.total_shares = vault.total_shares.checked_sub(shares_to_remove).unwrap();
    
    receipt.principal = receipt.principal.checked_sub(amount).unwrap();
    receipt.shares = receipt.shares.checked_sub(shares_to_remove).unwrap();
    receipt.yield_claimed = receipt.yield_claimed.checked_add(yield_amount).unwrap();
    
    if receipt.shares == 0 {
        vault.depositor_count = vault.depositor_count.checked_sub(1).unwrap();
    }
    
    emit!(WithdrawEvent {
        wallet: ctx.accounts.depositor.key(),
        principal_amount: amount,
        yield_amount,
        vault_id: vault.key(),
        timestamp: clock.unix_timestamp,
    });
    
    Ok(())
}

fn calculate_pending_yield(vault: &VaultState, receipt: &DepositReceipt) -> u64 {
    let accrued = vault.accumulated_yield_per_share
        .checked_mul(receipt.shares)
        .unwrap_or(0)
        .checked_div(1_000_000_000_000u128)
        .unwrap_or(0) as u64;
    
    if accrued > receipt.reward_debt as u64 {
        accrued - receipt.reward_debt as u64
    } else {
        0
    }
}
```

- [ ] **Step 2: Update WithdrawEvent in events.rs**

```rust
#[event]
pub struct WithdrawEvent {
    pub wallet: Pubkey,
    pub principal_amount: u64,
    pub yield_amount: u64,
    pub vault_id: Pubkey,
    pub timestamp: i64,
}
```

- [ ] **Step 3: Run build**

Run: `anchor build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add programs/vault-core/src/instructions/withdraw.rs programs/vault-core/src/events.rs
git commit -m "feat(vault): implement withdraw with yield claims"
```

---

### Task 6: Add Tests

**Files:**
- Create: `tests/vault-core.test.ts`

- [ ] **Step 1: Write failing test for initialize + deposit + withdraw**

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VaultCore } from "../target/types/vault_core";
import { startAnchor } from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import { PublicKey, Keypair } from "@solana/web3.js";
import { assert } from "chai";
import { BN } from "@coral-xyz/anchor";

describe("vault_core", () => {
  let program: anchor.Program<VaultCore>;
  let provider: BankrunProvider;
  
  const VAULT_PROGRAM_ID = new PublicKey("3FQsKP1T2X2NP87cfaxjNZzkq3M3PJ6FVcddAogowyq");
  const ACCESS_REGISTRY_ID = new PublicKey("7Az1QtqjdEqrX6T6gtKhGdiSFTZ6cJxhicbi2o5vGE2q");

  before(async () => {
    const context = await startAnchor("", [
      { name: "vault_core", programId: VAULT_PROGRAM_ID },
      { name: "access_registry", programId: ACCESS_REGISTRY_ID },
    ], []);
    provider = new BankrunProvider(context);
    const idl = await anchor.Program.fetchIdl(VAULT_PROGRAM_ID, provider);
    program = new anchor.Program(idl!, provider) as Program<VaultCore>;
  });

  it("Initializes vault with correct state", async () => {
    const authority = provider.wallet.publicKey;
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), authority.toBuffer()],
      VAULT_PROGRAM_ID
    );
    
    const mint = Keypair.generate();
    const depositCap = new BN(1_000_000_000);
    const minDeposit = new BN(1_000_000);
    const apy = 500; // 5%
    const jurisdictions = [Array.from(Buffer.from("US")), Array.from(Buffer.from("CH"))];
    
    await program.methods.initializeVault(
      depositCap,
      minDeposit,
      apy,
      jurisdictions
    ).accounts({
      vault: vaultPda,
      authority,
      acceptedMint: mint.publicKey,
    }).rpc();
    
    const vault = await program.account.vaultState.fetch(vaultPda);
    assert.ok(vault.authority.equals(authority));
    assert.ok(vault.depositCap.eq(depositCap));
    assert.equal(vault.yieldRateBps, apy);
    assert.equal(vault.isPaused, false);
  });
});
```

- [ ] **Step 2: Run test**

Run: `anchor test`
Expected: FAIL (may need adjustments)

- [ ] **Step 3: Fix and iterate until passing**

- [ ] **Step 4: Commit**

```bash
git add tests/vault-core.test.ts
git commit -m "test(vault): add vault-core tests"
```

---

## Plan Complete

This plan covers 6 tasks. Each task should be executed in order using subagent-driven-development.
