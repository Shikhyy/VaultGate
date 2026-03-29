# VaultGate — vault-core Anchor Program Design Spec

**Date:** 2026-03-29
**Status:** Approved
**Scope:** All on-chain programs (Agent 1 domain)

---

## 1. Overview

Three Anchor programs form the on-chain layer of VaultGate:

1. **access-registry** — Stores one WalletRecord PDA per KYC-verified wallet. Oracle writes, everyone reads.
2. **kyc-hook** — Transfer Hook program. Called automatically by Token Extensions on every USDC/EURC transfer. Checks the sender's WalletRecord for KYC status, sanctions, expiry, and jurisdiction.
3. **vault-core** — Permissioned yield vault. Accepts deposits from KYC'd wallets (enforced by the hook), tracks positions, and distributes yield using a global yield-per-share accumulator.

Deployment order matters: access-registry → kyc-hook → create Token2022 mint with hook extension → vault-core.

---

## 2. Programs

### 2.1 access-registry

**Purpose:** On-chain KYC whitelist. One PDA per verified wallet for O(1) lookups.

**Accounts:**

```rust
#[account]
pub struct WalletRecord {
    pub wallet: Pubkey,           // 32 bytes
    pub jurisdiction: [u8; 2],    // 2  (ISO 3166-1 alpha-2, e.g. b"CH")
    pub tier: u8,                 // 1  (1=retail, 2=institutional, 3=prime)
    pub verified_at: i64,         // 8
    pub expires_at: i64,          // 8
    pub is_sanctioned: bool,      // 1
    pub bump: u8,                 // 1
}
// Seeds: ["wallet-record", wallet_pubkey]
// Total: 53 bytes + 8 discriminator = 61 bytes
```

**Instructions:**

| Instruction | Signer | Description |
|---|---|---|
| `upsert_wallet_record` | Oracle keypair | Create or update a WalletRecord PDA |
| `revoke_wallet_record` | Oracle keypair | Close the PDA, return rent to oracle |

**Events:**
- `WalletRecordUpdated { wallet, jurisdiction, tier, verified_at, expires_at }`
- `WalletRecordRevoked { wallet }`

**Constraints:**
- Only the designated oracle authority can write/revoke.
- Oracle authority is set at program initialization and stored in a `RegistryConfig` PDA (seeds: `["registry-config"]`).

```rust
#[account]
pub struct RegistryConfig {
    pub oracle_authority: Pubkey,  // 32
    pub admin: Pubkey,             // 32 (can change oracle_authority)
    pub total_records: u64,        // 8
    pub bump: u8,                  // 1
}
// Seeds: ["registry-config"]
```

---

### 2.2 kyc-hook (Transfer Hook)

**Purpose:** Enforces KYC compliance at the token transfer level. Every transfer of the vault's USDC/EURC mint passes through this hook.

**Instructions:**

| Instruction | Description |
|---|---|
| `initialize_extra_account_meta_list` | Registers the WalletRecord PDA and vault config as extra accounts required on every transfer |
| `transfer_hook` | Called by Token Extensions runtime. Checks KYC, sanctions, expiry, jurisdiction. |

**transfer_hook checks (in order):**
1. Sender has a WalletRecord PDA (exists check → `NotKycVerified`)
2. `is_sanctioned == false` (→ `SanctionedAddress`)
3. `expires_at > Clock::unix_timestamp` (→ `KycExpired`)
4. `jurisdiction` is in vault's `allowed_jurisdictions` (→ `JurisdictionNotAllowed`)

**Key constraint:** The hook program must be deployed BEFORE the Token2022 mint is created with the `TransferHook` extension.

---

### 2.3 vault-core

**Purpose:** Permissioned yield vault with real on-chain yield distribution.

#### Accounts

```rust
#[account]
pub struct VaultState {
    pub authority: Pubkey,                  // 32 — vault admin
    pub accepted_mint: Pubkey,              // 32 — Token2022 USDC/EURC mint
    pub vault_token_account: Pubkey,        // 32 — vault's token account
    pub yield_reserve_account: Pubkey,      // 32 — holds funds for yield distribution
    pub deposit_cap: u64,                   // 8
    pub min_deposit: u64,                   // 8
    pub total_deposits: u64,                // 8
    pub total_shares: u64,                  // 8  — total deposit shares outstanding
    pub accumulated_yield_per_share: u128,  // 16 — scaled by 1e12
    pub yield_rate_bps: u16,               // 2  — annual rate in basis points
    pub last_yield_accrual: i64,            // 8
    pub total_yield_distributed: u64,       // 8
    pub allowed_jurisdictions: [[u8; 2]; 10], // 20 — max 10 jurisdictions
    pub jurisdiction_count: u8,             // 1
    pub is_paused: bool,                    // 1
    pub depositor_count: u32,               // 4
    pub bump: u8,                           // 1
}
// Seeds: ["vault", authority]
```

```rust
#[account]
pub struct DepositRecord {
    pub vault: Pubkey,         // 32
    pub depositor: Pubkey,     // 32
    pub shares: u64,           // 8  — depositor's share of the vault
    pub principal: u64,        // 8  — original deposit amount (for display)
    pub reward_debt: u128,     // 16 — accumulated_yield_per_share * shares at deposit time
    pub deposited_at: i64,     // 8
    pub bump: u8,              // 1
}
// Seeds: ["deposit", vault, depositor]
```

#### Yield Engine (Global Index Pattern)

This is the standard Compound/SushiSwap MasterChef yield distribution model:

**On `accrue_yield()` (permissionless crank):**
```
time_elapsed = now - last_yield_accrual
if total_shares > 0:
    yield_for_period = total_deposits * yield_rate_bps * time_elapsed / (10000 * SECONDS_PER_YEAR)
    accumulated_yield_per_share += yield_for_period * 1e12 / total_shares
last_yield_accrual = now
```

**On `deposit(amount)`:**
```
accrue_yield()  // always accrue first
shares = amount  // 1:1 for simplicity
deposit_record.shares += shares
deposit_record.reward_debt += accumulated_yield_per_share * shares / 1e12
vault.total_shares += shares
vault.total_deposits += amount
```

**Pending yield for a depositor:**
```
pending = (accumulated_yield_per_share * shares / 1e12) - reward_debt
```

**On `withdraw(amount)`:**
```
accrue_yield()
pending_yield = (accumulated_yield_per_share * shares / 1e12) - reward_debt
transfer principal from vault_token_account to depositor
transfer pending_yield from yield_reserve_account to depositor
update shares, reward_debt, total_shares, total_deposits
```

The yield reserve is funded by the admin via `fund_yield_reserve`. In production this would be Kamino returns; for now the admin pre-funds it.

#### Instructions

| Instruction | Signer | Paused? | Description |
|---|---|---|---|
| `initialize_vault` | Admin | N/A | Create vault with config |
| `deposit` | Depositor | Blocked | Transfer USDC in, mint shares |
| `withdraw` | Depositor | Allowed | Withdraw principal + yield |
| `claim_yield` | Depositor | Allowed | Claim accrued yield only |
| `accrue_yield` | Anyone (crank) | Allowed | Update global yield index |
| `fund_yield_reserve` | Admin | Allowed | Fund the yield reserve account |
| `update_vault_config` | Admin | Allowed | Update cap, min, rate, jurisdictions |
| `pause_vault` | Admin | N/A | Pause deposits |
| `unpause_vault` | Admin | N/A | Unpause deposits |

#### Events

```rust
#[event]
pub struct DepositEvent {
    pub wallet: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub vault: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawEvent {
    pub wallet: Pubkey,
    pub principal_amount: u64,
    pub yield_amount: u64,
    pub vault: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct YieldAccruedEvent {
    pub vault: Pubkey,
    pub yield_per_share_delta: u128,
    pub total_yield_distributed: u64,
    pub timestamp: i64,
}

#[event]
pub struct VaultConfigUpdated {
    pub vault: Pubkey,
    pub field: String,
    pub timestamp: i64,
}

#[event]
pub struct VaultPausedEvent {
    pub vault: Pubkey,
    pub paused: bool,
    pub timestamp: i64,
}
```

---

## 3. Error Codes

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
    #[msg("Insufficient balance for withdrawal")]
    InsufficientBalance,
    #[msg("Unauthorized — not the vault admin")]
    Unauthorized,
    #[msg("Unauthorized — not the oracle authority")]
    UnauthorizedOracle,
    #[msg("Arithmetic overflow in yield calculation")]
    MathOverflow,
    #[msg("Insufficient yield reserve for distribution")]
    InsufficientYieldReserve,
    #[msg("No yield to claim")]
    NoYieldToClaim,
}
```

---

## 4. PDA Schema

| PDA | Seeds | Program |
|---|---|---|
| `RegistryConfig` | `["registry-config"]` | access-registry |
| `WalletRecord` | `["wallet-record", wallet_pubkey]` | access-registry |
| `VaultState` | `["vault", authority_pubkey]` | vault-core |
| `DepositRecord` | `["deposit", vault_pubkey, depositor_pubkey]` | vault-core |
| `ExtraAccountMetaList` | per SPL Transfer Hook spec | kyc-hook |

---

## 5. Security Model

- **Vault authority (admin):** Can configure vault, pause/unpause, fund yield reserve. Cannot modify KYC whitelist.
- **Oracle authority:** Can write/revoke WalletRecord PDAs. Cannot touch vault funds or config.
- **Depositor:** Can deposit (if KYC'd), withdraw, claim yield. Cannot modify any config.
- **Crank (anyone):** Can call `accrue_yield`. Cannot move funds.

No single key controls both funds and whitelist — these are separate authority chains.

---

## 6. Testing Strategy

All tests use Anchor test framework with `solana-bankrun` for fast local execution.

Test categories:
1. **access-registry:** upsert, revoke, oracle-only constraint
2. **kyc-hook:** transfer blocked for non-KYC'd, sanctioned, expired, wrong jurisdiction; allowed for valid
3. **vault-core:** deposit, withdraw, yield accrual, yield claim, pause/unpause, cap enforcement, min deposit, config updates
4. **Integration:** End-to-end deposit → accrue → withdraw with yield
