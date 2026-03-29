use anchor_lang::prelude::*;

#[event]
pub struct TransferChecked {
    pub wallet: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}
