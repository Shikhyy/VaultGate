use anchor_lang::prelude::*;

declare_id!("7Az1QtqjdEqrX6T6gtKhGdiSFTZ6cJxhicbi2o5vGE2q");

#[program]
pub mod access_registry {
    use super::*;

    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn upsert_wallet_record(
        ctx: Context<UpsertWalletRecord>,
        jurisdiction: [u8; 2],
        tier: u8,
        expires_at: i64,
        is_sanctioned: bool,
    ) -> Result<()> {
        let record = &mut ctx.accounts.wallet_record;

        // If it's a new account, set the static fields
        if record.verified_at == 0 {
            record.wallet = ctx.accounts.wallet.key();
            record.verified_at = Clock::get()?.unix_timestamp;
            record.bump = ctx.bumps.wallet_record;
        }

        record.jurisdiction = jurisdiction;
        record.tier = tier;
        record.expires_at = expires_at;
        record.is_sanctioned = is_sanctioned;

        emit!(WalletRecordUpdated {
            wallet: record.wallet,
            jurisdiction,
            tier,
            expires_at,
            is_sanctioned,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn set_sanctioned(ctx: Context<SetSanctioned>, is_sanctioned: bool) -> Result<()> {
        let record = &mut ctx.accounts.wallet_record;
        record.is_sanctioned = is_sanctioned;

        emit!(WalletSanctioned {
            wallet: record.wallet,
            is_sanctioned,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn remove_wallet_record(_ctx: Context<RemoveWalletRecord>) -> Result<()> {
        // Handled entirely by Anchor's `close` constraint
        // Rent is refunded to the oracle
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1, // discriminator + pubkey + bump
        seeds = [b"registry-config"],
        bump
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpsertWalletRecord<'info> {
    #[account(
        init_if_needed,
        payer = oracle,
        space = 8 + 61,
        seeds = [b"wallet-record", wallet.key().as_ref()],
        bump
    )]
    pub wallet_record: Account<'info, WalletRecord>,
    /// CHECK: The wallet address to whitelist. Not a signer.
    pub wallet: UncheckedAccount<'info>,
    #[account(
        seeds = [b"registry-config"],
        bump = config.bump,
        has_one = authority @ RegistryError::UnauthorizedOracle
    )]
    pub config: Account<'info, RegistryConfig>,
    /// The oracle signing this transaction, must match config.authority
    #[account(mut)]
    pub oracle: Signer<'info>,
    /// CHECK: We map 'oracle' signer to 'authority' field to satisfy has_one
    #[account(address = oracle.key())]
    pub authority: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetSanctioned<'info> {
    #[account(
        mut,
        seeds = [b"wallet-record", wallet_record.wallet.key().as_ref()],
        bump = wallet_record.bump
    )]
    pub wallet_record: Account<'info, WalletRecord>,
    #[account(
        seeds = [b"registry-config"],
        bump = config.bump,
        has_one = authority @ RegistryError::UnauthorizedOracle
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub oracle: Signer<'info>,
    /// CHECK: For has_one
    #[account(address = oracle.key())]
    pub authority: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct RemoveWalletRecord<'info> {
    #[account(
        mut,
        close = oracle,
        seeds = [b"wallet-record", wallet_record.wallet.key().as_ref()],
        bump = wallet_record.bump
    )]
    pub wallet_record: Account<'info, WalletRecord>,
    #[account(
        seeds = [b"registry-config"],
        bump = config.bump,
        has_one = authority @ RegistryError::UnauthorizedOracle
    )]
    pub config: Account<'info, RegistryConfig>,
    #[account(mut)]
    pub oracle: Signer<'info>,
    /// CHECK: For has_one
    #[account(address = oracle.key())]
    pub authority: UncheckedAccount<'info>,
}

#[account]
pub struct RegistryConfig {
    pub authority: Pubkey, // 32
    pub bump: u8,          // 1
}

#[account]
pub struct WalletRecord {
    pub wallet: Pubkey,        // 32
    pub jurisdiction: [u8; 2], // 2
    pub tier: u8,              // 1
    pub verified_at: i64,      // 8
    pub expires_at: i64,       // 8
    pub is_sanctioned: bool,   // 1
    pub bump: u8,              // 1
}

impl WalletRecord {
    pub fn is_valid(&self, clock: &Clock) -> bool {
        !self.is_sanctioned && self.expires_at > clock.unix_timestamp
    }

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

#[error_code]
pub enum RegistryError {
    #[msg("Unauthorized oracle signer")]
    UnauthorizedOracle,
}

#[event]
pub struct WalletRecordUpdated {
    pub wallet: Pubkey,
    pub jurisdiction: [u8; 2],
    pub tier: u8,
    pub expires_at: i64,
    pub is_sanctioned: bool,
    pub timestamp: i64,
}

#[event]
pub struct WalletSanctioned {
    pub wallet: Pubkey,
    pub is_sanctioned: bool,
    pub timestamp: i64,
}
