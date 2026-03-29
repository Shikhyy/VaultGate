# PDA Schema — VaultGate

> **Owner:** Agent 1 (Anchor Architect)  
> **Consumers:** Agent 2 (Oracle), Agent 3 (Frontend)  
> **Last updated:** 2026-03-29 — vault-core Stage 1 implementation

---

## VaultCore PDAs

### VaultState PDA

The main vault configuration and state account.

#### Seeds

```
["vault", authority_pubkey]
```

#### Account Layout

| Field                      | Type          | Bytes | Description                              |
|----------------------------|---------------|-------|------------------------------------------|
| authority                  | `Pubkey`      | 32    | Vault admin authority                    |
| accepted_mint              | `Pubkey`      | 32    | USDC/EURC mint address                   |
| vault_token_account        | `Pubkey`      | 32    | Vault's token account for deposits       |
| yield_reserve_account      | `Pubkey`      | 32    | Reserve for yield distribution           |
| deposit_cap                | `u64`         | 8     | Maximum total deposits                   |
| min_deposit                | `u64`         | 8     | Minimum deposit amount                    |
| total_deposits             | `u64`         | 8     | Current total deposits                   |
| total_shares               | `u64`         | 8     | Total shares outstanding                 |
| accumulated_yield_per_share | `u128`        | 16    | Yield index (scaled by 1e12)             |
| yield_rate_bps             | `u16`         | 2     | Annual yield rate in basis points        |
| last_yield_accrual         | `i64`         | 8     | Unix timestamp of last yield accrual     |
| total_yield_distributed    | `u64`         | 8     | Total yield distributed to date          |
| allowed_jurisdictions      | `[[u8; 2]; 10]` | 20  | Array of allowed ISO codes               |
| jurisdiction_count        | `u8`          | 1     | Number of allowed jurisdictions          |
| is_paused                  | `bool`        | 1     | Whether deposits are paused               |
| depositor_count            | `u32`         | 4     | Number of unique depositors              |
| bump                       | `u8`          | 1     | PDA bump seed                            |

**Total: 233 bytes (including 8-byte discriminator)**

#### Rust Definition

```rust
pub const MAX_JURISDICTIONS: usize = 10;

#[account]
pub struct VaultState {
    pub authority: Pubkey,
    pub accepted_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub yield_reserve_account: Pubkey,
    pub deposit_cap: u64,
    pub min_deposit: u64,
    pub total_deposits: u64,
    pub total_shares: u64,
    pub accumulated_yield_per_share: u128,
    pub yield_rate_bps: u16,
    pub last_yield_accrual: i64,
    pub total_yield_distributed: u64,
    pub allowed_jurisdictions: [[u8; 2]; MAX_JURISDICTIONS],
    pub jurisdiction_count: u8,
    pub is_paused: bool,
    pub depositor_count: u32,
    pub bump: u8,
}
```

---

### DepositRecord PDA

Per-depositor position tracking.

#### Seeds

```
["deposit", vault_pubkey, depositor_pubkey]
```

#### Account Layout

| Field          | Type       | Bytes | Description                        |
|----------------|------------|-------|------------------------------------|
| vault          | `Pubkey`   | 32    | Vault address                      |
| depositor      | `Pubkey`   | 32    | Depositor wallet address            |
| shares         | `u64`      | 8     | Number of vault shares             |
| principal      | `u64`      | 8     | Original deposit amount            |
| reward_debt    | `u128`     | 16    | Yield already credited              |
| deposited_at   | `i64`      | 8     | Unix timestamp of last deposit     |
| bump           | `u8`       | 1     | PDA bump seed                      |

**Total: 113 bytes (including 8-byte discriminator)**

#### Rust Definition

```rust
#[account]
pub struct DepositRecord {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub shares: u64,
    pub principal: u64,
    pub reward_debt: u128,
    pub deposited_at: i64,
    pub bump: u8,
}
```

---

## AccessRegistry PDAs

### WalletRecord PDA

One PDA per verified wallet. Used by the Transfer Hook to check KYC status
on every token transfer.

### Seeds

```
["wallet-record", wallet_pubkey]
```

```
Pubkey::find_program_address(
    &[b"wallet-record", wallet.as_ref()],
    &ACCESS_REGISTRY_PROGRAM_ID
)
```

### Account Layout

| Field          | Type       | Bytes | Description                                    |
|----------------|------------|-------|------------------------------------------------|
| wallet         | `Pubkey`   | 32    | Wallet public key                              |
| jurisdiction   | `[u8; 2]`  | 2     | ISO 3166-1 alpha-2 code (e.g. `b"CH"`)        |
| tier           | `u8`       | 1     | 1=retail, 2=institutional, 3=prime             |
| verified_at    | `i64`      | 8     | Unix timestamp of KYC verification             |
| expires_at     | `i64`      | 8     | Unix timestamp of KYC expiry                   |
| is_sanctioned  | `bool`     | 1     | `true` blocks all transfers                    |
| bump           | `u8`       | 1     | PDA bump seed                                  |

**Total: 53 bytes + 8 byte discriminator = 61 bytes per record**

### Rust Definition

```rust
#[account]
pub struct WalletRecord {
    pub wallet: Pubkey,           // 32
    pub jurisdiction: [u8; 2],    // 2
    pub tier: u8,                 // 1
    pub verified_at: i64,         // 8
    pub expires_at: i64,          // 8
    pub is_sanctioned: bool,      // 1
    pub bump: u8,                 // 1
}
```

### Instructions

#### `upsert_wallet_record`

Creates or updates a WalletRecord PDA. Called by the oracle service.

**Accounts:**
| Account         | Mutable | Signer | Description                          |
|-----------------|---------|--------|--------------------------------------|
| wallet_record   | ✓       |        | PDA to create/update                 |
| wallet          |         |        | The wallet being whitelisted         |
| oracle          | ✓       | ✓      | Oracle keypair (authorized writer)   |
| system_program  |         |        | System program                       |

**Args:**
```rust
pub struct UpsertParams {
    pub jurisdiction: [u8; 2],
    pub tier: u8,
    pub expires_at: i64,
    pub is_sanctioned: bool,
}
```

#### `revoke_wallet_record`

Marks a WalletRecord as sanctioned. Does NOT delete the PDA (preserves audit trail).

**Accounts:**
| Account         | Mutable | Signer | Description                          |
|-----------------|---------|--------|--------------------------------------|
| wallet_record   | ✓       |        | PDA to revoke                        |
| oracle          | ✓       | ✓      | Oracle keypair (authorized writer)   |
| system_program  |         |        | System program                       |

---

## Authority Model

```
Oracle Keypair (ORACLE_KEYPAIR)
  └── Can ONLY write to WalletRecord PDAs
  └── Cannot modify vault configuration
  └── Cannot move vault funds
```

The oracle is a write-only authority for the whitelist. It cannot interact
with the vault program's deposit/withdraw instructions.
