use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub authority: Pubkey,
    pub accepted_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub yield_reserve_account: Pubkey,
    pub deposit_cap: u64,
    pub min_deposit: u64,
    pub current_apy: u16,
    pub timestamp: i64,
}

#[event]
pub struct DepositEvent {
    pub wallet: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub vault_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawEvent {
    pub wallet: Pubkey,
    pub principal_amount: u64,
    pub yield_amount: u64,
    pub vault_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct YieldClaimed {
    pub wallet: Pubkey,
    pub amount: u64,
    pub vault_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct YieldReserveFunded {
    pub authority: Pubkey,
    pub amount: u64,
    pub vault_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultConfigUpdated {
    pub vault_id: Pubkey,
    pub field: u8,
    pub timestamp: i64,
}

#[event]
pub struct YieldAccrued {
    pub vault_id: Pubkey,
    pub amount: u64,
    pub total_yield: u64,
    pub timestamp: i64,
}
