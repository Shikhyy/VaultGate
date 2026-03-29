# PDA Schema — VaultGate AccessRegistry

> **Owner:** Agent 1 (Anchor Architect)  
> **Consumers:** Agent 2 (Oracle), Agent 3 (Frontend)  
> **Last updated:** Draft — based on SKILLS.md specification

---

## WalletRecord PDA

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
