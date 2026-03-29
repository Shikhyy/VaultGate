use anchor_lang::prelude::*;

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
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Invalid mint provided")]
    InvalidMint,
    #[msg("Insufficient funds in deposit receipt")]
    InsufficientFunds,
    #[msg("Math overflow error")]
    MathOverflow,
    #[msg("No yield to claim")]
    NoYieldToClaim,
}
