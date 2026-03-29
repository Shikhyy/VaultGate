use anchor_lang::prelude::*;

const MAX_JURISDICTIONS: usize = 10;

#[account]
pub struct VaultState {
    pub authority: Pubkey,                                   // 32
    pub accepted_mint: Pubkey,                               // 32
    pub vault_token_account: Pubkey,                         // 32
    pub yield_reserve_account: Pubkey,                       // 32
    pub deposit_cap: u64,                                    // 8
    pub min_deposit: u64,                                    // 8
    pub total_deposits: u64,                                 // 8
    pub total_shares: u64,                                   // 8
    pub accumulated_yield_per_share: u128,                   // 16 (scaled by 1e12)
    pub yield_rate_bps: u16,                                 // 2
    pub last_yield_accrual: i64,                             // 8
    pub total_yield_distributed: u64,                        // 8
    pub allowed_jurisdictions: [[u8; 2]; MAX_JURISDICTIONS], // 20
    pub jurisdiction_count: u8,                              // 1
    pub is_paused: bool,                                     // 1
    pub depositor_count: u32,                                // 4
    pub bump: u8,                                            // 1
}

impl VaultState {
    pub const SPACE: usize =
        8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 16 + 2 + 8 + 8 + 20 + 1 + 1 + 4 + 1;
}

#[account]
pub struct DepositRecord {
    pub vault: Pubkey,     // 32
    pub depositor: Pubkey, // 32
    pub shares: u64,       // 8
    pub principal: u64,    // 8
    pub reward_debt: u128, // 16
    pub deposited_at: i64, // 8
    pub bump: u8,          // 1
}

impl DepositRecord {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 16 + 8 + 1;
}

#[account]
pub struct DepositReceipt {
    pub vault: Pubkey,     // 32
    pub depositor: Pubkey, // 32
    pub shares: u64,       // 8
    pub principal: u64,    // 8
    pub reward_debt: u128, // 16 (accumulated_yield_per_share * shares at deposit)
    pub deposited_at: i64, // 8
    pub bump: u8,          // 1
}

impl DepositReceipt {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 16 + 8 + 1;
}
