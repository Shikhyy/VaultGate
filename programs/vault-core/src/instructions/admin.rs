use crate::{
    errors::VaultError,
    events::{VaultConfigUpdated, YieldAccrued},
    state::{VaultState, MAX_JURISDICTIONS},
};
use anchor_lang::prelude::*;

const YIELD_SCALE: u128 = 1_000_000_000_000u128;

#[derive(Accounts)]
pub struct UpdateVaultConfig<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = vault.authority == authority.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn handle_update_config(
    ctx: Context<UpdateVaultConfig>,
    deposit_cap: Option<u64>,
    min_deposit: Option<u64>,
    yield_rate_bps: Option<u16>,
    allowed_jurisdictions: Option<Vec<[u8; 2]>>,
    is_paused: Option<bool>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let timestamp = Clock::get()?.unix_timestamp;

    if let Some(cap) = deposit_cap {
        vault.deposit_cap = cap;
        emit!(VaultConfigUpdated {
            vault_id: vault.key(),
            field: 0,
            timestamp
        });
    }
    if let Some(min) = min_deposit {
        vault.min_deposit = min;
        emit!(VaultConfigUpdated {
            vault_id: vault.key(),
            field: 1,
            timestamp
        });
    }
    if let Some(bps) = yield_rate_bps {
        vault.yield_rate_bps = bps;
        emit!(VaultConfigUpdated {
            vault_id: vault.key(),
            field: 2,
            timestamp
        });
    }
    if let Some(jurisdictions) = allowed_jurisdictions {
        let mut new_jurisdictions = [[0u8; 2]; MAX_JURISDICTIONS];
        for (i, j) in jurisdictions.iter().enumerate() {
            if i < MAX_JURISDICTIONS {
                new_jurisdictions[i] = *j;
            }
        }
        vault.allowed_jurisdictions = new_jurisdictions;
        vault.jurisdiction_count = jurisdictions.len() as u8;
        emit!(VaultConfigUpdated {
            vault_id: vault.key(),
            field: 3,
            timestamp
        });
    }
    if let Some(paused) = is_paused {
        vault.is_paused = paused;
        emit!(VaultConfigUpdated {
            vault_id: vault.key(),
            field: 4,
            timestamp
        });
    }

    Ok(())
}

#[derive(Accounts)]
pub struct AccrueYield<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,
}

pub fn handle_accrue_yield(ctx: Context<AccrueYield>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    let time_elapsed = clock.unix_timestamp - vault.last_yield_accrual;
    if time_elapsed <= 0 || vault.total_shares == 0 {
        return Ok(());
    }

    let seconds_in_year = 31536000i64;

    let yield_amount = (vault.total_deposits as u128)
        .checked_mul(vault.yield_rate_bps as u128)
        .ok_or(VaultError::MathOverflow)?
        .checked_mul(time_elapsed as u128)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(10000)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(seconds_in_year as u128)
        .ok_or(VaultError::MathOverflow)? as u64;

    if yield_amount > 0 {
        let yield_per_share = yield_amount
            .checked_mul(YIELD_SCALE as u64)
            .ok_or(VaultError::MathOverflow)?
            .checked_div(vault.total_shares)
            .ok_or(VaultError::MathOverflow)?;

        vault.accumulated_yield_per_share = vault
            .accumulated_yield_per_share
            .checked_add(yield_per_share as u128)
            .ok_or(VaultError::MathOverflow)?;
        vault.total_yield_distributed = vault
            .total_yield_distributed
            .checked_add(yield_amount)
            .ok_or(VaultError::MathOverflow)?;
    }
    vault.last_yield_accrual = clock.unix_timestamp;

    emit!(YieldAccrued {
        vault_id: vault.key(),
        amount: yield_amount,
        total_yield: vault.total_yield_distributed,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
