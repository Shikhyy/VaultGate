use crate::{
    errors::VaultError,
    events::YieldClaimed,
    state::{DepositRecord, VaultState},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

const YIELD_SCALE: u128 = 1_000_000_000_000u128;

#[derive(Accounts)]
pub struct ClaimYield<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [b"deposit", vault.key().as_ref(), depositor.key().as_ref()],
        bump = deposit_record.bump,
        constraint = deposit_record.depositor == depositor.key() @ VaultError::Unauthorized
    )]
    pub deposit_record: Account<'info, DepositRecord>,

    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = vault,
    )]
    pub yield_reserve_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = depositor,
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    pub accepted_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_claim_yield(ctx: Context<ClaimYield>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let record = &mut ctx.accounts.deposit_record;
    let clock = Clock::get()?;

    accrue_yield_internal(vault, clock.unix_timestamp)?;

    let pending_yield = calculate_pending_yield(vault, record);
    require!(pending_yield > 0, VaultError::NoYieldToClaim);

    let authority_key = vault.authority.key();
    let seeds = &[b"vault".as_ref(), authority_key.as_ref(), &[vault.bump]];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.yield_reserve_account.to_account_info(),
        mint: ctx.accounts.accepted_mint.to_account_info(),
        to: ctx.accounts.depositor_token_account.to_account_info(),
        authority: vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    transfer_checked(cpi_ctx, pending_yield, ctx.accounts.accepted_mint.decimals)?;

    record.reward_debt = record
        .reward_debt
        .checked_add(pending_yield as u128)
        .ok_or(VaultError::MathOverflow)?;

    emit!(YieldClaimed {
        wallet: ctx.accounts.depositor.key(),
        amount: pending_yield,
        vault_id: vault.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

fn calculate_pending_yield(vault: &VaultState, record: &DepositRecord) -> u64 {
    let earned = vault
        .accumulated_yield_per_share
        .checked_mul(record.shares as u128)
        .unwrap_or(0)
        .checked_div(YIELD_SCALE)
        .unwrap_or(0) as u64;

    if earned >= record.reward_debt as u64 {
        earned - record.reward_debt as u64
    } else {
        0
    }
}

fn accrue_yield_internal(vault: &mut VaultState, now: i64) -> Result<()> {
    let time_elapsed = now - vault.last_yield_accrual;
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
    vault.last_yield_accrual = now;
    Ok(())
}
