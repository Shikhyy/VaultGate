use anchor_lang::prelude::*;

#[account]
pub struct WalletRecord {
    pub wallet: Pubkey,        // 32
    pub jurisdiction: [u8; 2], // 2  (ISO 3166-1 alpha-2, e.g. b"CH")
    pub tier: u8,              // 1  (1=retail, 2=institutional, 3=prime)
    pub verified_at: i64,      // 8
    pub expires_at: i64,       // 8
    pub is_sanctioned: bool,   // 1
    pub bump: u8,              // 1
}

impl WalletRecord {
    pub const SIZE: usize = 8 + 32 + 2 + 1 + 8 + 8 + 1 + 1; // 61 bytes

    pub fn is_whitelisted(&self) -> bool {
        self.verified_at > 0
    }

    pub fn is_sanctioned(&self) -> bool {
        self.is_sanctioned
    }

    pub fn jurisdiction_allowed(&self, allowed: &[[u8; 2]]) -> bool {
        allowed.iter().any(|j| *j == self.jurisdiction)
    }
}

#[account]
pub struct RegistryConfig {
    pub oracle_authority: Pubkey, // 32
    pub admin: Pubkey,            // 32
    pub total_records: u64,       // 8
    pub bump: u8,                 // 1
}

impl RegistryConfig {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1; // 81 bytes
}
