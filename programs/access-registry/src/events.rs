use anchor_lang::prelude::*;

#[event]
pub struct WalletRecordUpdated {
    pub wallet: Pubkey,
    pub jurisdiction: [u8; 2],
    pub tier: u8,
    pub verified_at: i64,
    pub expires_at: i64,
}

#[event]
pub struct WalletRecordRevoked {
    pub wallet: Pubkey,
}

#[event]
pub struct WalletSanctioned {
    pub wallet: Pubkey,
}
