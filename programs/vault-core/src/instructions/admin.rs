use anchor_lang::prelude::*;
use crate::{state::VaultState, errors::VaultError, events::{VaultConfigUpdated, YieldAccrued}};

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
    current_apy: Option<u16>,
    allowed_jurisdictions: Option<Vec<[u8; 2]>>,
    is_paused: Option<bool>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let timestamp = Clock::get()?.unix_timestamp;

    if let Some(cap) = deposit_cap {
        vault.deposit_cap = cap;
        emit!(VaultConfigUpdated { vault_id: vault.key(), field: 0, timestamp });
    }
    if let Some(min) = min_deposit {
        vault.min_deposit = min;
        emit!(VaultConfigUpdated { vault_id: vault.key(), field: 1, timestamp });
    }
    if let Some(apy) = current_apy {
        vault.current_apy = apy;
        emit!(VaultConfigUpdated { vault_id: vault.key(), field: 2, timestamp });
    }
    if let Some(jurisdictions) = allowed_jurisdictions {
        vault.allowed_jurisdictions = jurisdictions;
        emit!(VaultConfigUpdated { vault_id: vault.key(), field: 3, timestamp });
    }
    if let Some(paused) = is_paused {
        vault.is_paused = paused;
        emit!(VaultConfigUpdated { vault_id: vault.key(), field: 4, timestamp });
    }

    Ok(())
}

#[derive(Accounts)]
pub struct AccrueYield<'info> {
    #[account(mut)]
    pub vault: Account<'info, VaultState>,
}

pub fn handle_accrue_yield(ctx: Context<AccrueYield>) -> Result<()> {
    // Crank instruction to update global vault mock yield tracked
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;
    
    let time_elapsed = clock.unix_timestamp - vault.last_yield_update;
    if time_elapsed <= 0 || vault.total_deposits == 0 {
        return Ok(());
    }

    let seconds_in_year = 31536000;
    
    let yield_amount = (vault.total_deposits as u128)
        .checked_mul(vault.current_apy as u128).unwrap()
        .checked_mul(time_elapsed as u128).unwrap()
        .checked_div(10000).unwrap()
        .checked_div(seconds_in_year as u128).unwrap() as u64;

    vault.accrued_yield = vault.accrued_yield.checked_add(yield_amount).unwrap();
    vault.last_yield_update = clock.unix_timestamp;

    emit!(YieldAccrued {
        vault_id: vault.key(),
        amount: yield_amount,
        total_yield: vault.accrued_yield,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
