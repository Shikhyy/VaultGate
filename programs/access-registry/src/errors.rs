use anchor_lang::prelude::*;

#[error_code]
pub enum RegistryError {
    #[msg("Unauthorized — not the oracle authority")]
    UnauthorizedOracle,
    #[msg("Unauthorized — not the admin")]
    UnauthorizedAdmin,
}
