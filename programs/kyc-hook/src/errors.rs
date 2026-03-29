use anchor_lang::prelude::*;

#[error_code]
pub enum HookError {
    #[msg("Wallet is not KYC verified in the access registry")]
    NotKycVerified,
    #[msg("Wallet address is on a sanctions list")]
    SanctionedAddress,
    #[msg("KYC record has expired — re-verification required")]
    KycExpired,
    #[msg("Wallet jurisdiction is not permitted for this vault")]
    JurisdictionNotAllowed,
}
