use anchor_lang::prelude::*;

const MAX_JURISDICTIONS: usize = 10;

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
    pub depositor_count: u32,
    pub is_paused: bool,
    pub bump: u8,
}

impl VaultState {
    pub const SPACE: usize =
        8 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 16 + 2 + 8 + 8 + 20 + 1 + 4 + 1 + 1;
}

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

impl DepositRecord {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 16 + 8 + 1;
}

#[account]
pub struct DepositReceipt {
    pub vault: Pubkey,
    pub depositor: Pubkey,
    pub shares: u64,
    pub principal: u64,
    pub reward_debt: u128,
    pub deposited_at: i64,
    pub bump: u8,
}

impl DepositReceipt {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 16 + 8 + 1;
}
