use anchor_lang::prelude::*;

#[event]
pub struct DepositEvent {
    pub wallet: Pubkey,
    pub amount: u64,
    pub vault_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawEvent {
    pub wallet: Pubkey,
    pub amount: u64,
    pub yield_amount: u64,
    pub vault_id: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultConfigUpdated {
    pub vault_id: Pubkey,
    pub field: u8, // 0: cap, 1: min, 2: apy, 3: jurisdictions, 4: paused
    pub timestamp: i64,
}

#[event]
pub struct YieldAccrued {
    pub vault_id: Pubkey,
    pub amount: u64,
    pub total_yield: u64,
    pub timestamp: i64,
}
