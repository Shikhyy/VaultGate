use crate::{
    errors::VaultError,
    events::DepositEvent,
    state::{DepositRecord, VaultState},
};
use access_registry::WalletRecord;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

const YIELD_SCALE: u128 = 1_000_000_000_000u128;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = !vault.is_paused @ VaultError::VaultPaused,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        init_if_needed,
        payer = depositor,
        space = DepositRecord::SPACE,
        seeds = [b"deposit", vault.key().as_ref(), depositor.key().as_ref()],
        bump
    )]
    pub deposit_record: Account<'info, DepositRecord>,

    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = vault,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = depositor,
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        seeds = [b"wallet-record", depositor.key().as_ref()],
        bump = wallet_record.bump,
        seeds::program = access_registry_program.key()
    )]
    pub wallet_record: Account<'info, WalletRecord>,

    #[account(address = access_registry::ID)]
    pub access_registry_program: UncheckedAccount<'info>,

    pub accepted_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    require!(amount >= vault.min_deposit, VaultError::BelowMinimum);

    let new_total = vault
        .total_deposits
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;
    require!(new_total <= vault.deposit_cap, VaultError::CapExceeded);

    let record = &ctx.accounts.wallet_record;
    require!(!record.is_sanctioned, VaultError::SanctionedAddress);
    require!(
        record.expires_at > clock.unix_timestamp,
        VaultError::KycExpired
    );

    let allowed = vault.allowed_jurisdictions[..vault.jurisdiction_count as usize]
        .iter()
        .any(|j| *j == record.jurisdiction);
    require!(allowed, VaultError::JurisdictionNotAllowed);

    accrue_yield_internal(vault, clock.unix_timestamp)?;

    let transfer_cpi_accounts = TransferChecked {
        from: ctx.accounts.depositor_token_account.to_account_info(),
        mint: ctx.accounts.accepted_mint.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        transfer_cpi_accounts,
    );
    transfer_checked(cpi_ctx, amount, ctx.accounts.accepted_mint.decimals)?;

    vault.total_deposits = new_total;

    let shares = amount;
    vault.total_shares = vault
        .total_shares
        .checked_add(shares)
        .ok_or(VaultError::MathOverflow)?;

    let record = &mut ctx.accounts.deposit_record;
    let is_new = record.shares == 0;

    if is_new {
        vault.depositor_count = vault
            .depositor_count
            .checked_add(1)
            .ok_or(VaultError::MathOverflow)?;
        record.vault = vault.key();
        record.depositor = ctx.accounts.depositor.key();
        record.bump = ctx.bumps.deposit_record;
    }

    let reward_debt = vault
        .accumulated_yield_per_share
        .checked_mul(shares as u128)
        .ok_or(VaultError::MathOverflow)?
        .checked_div(YIELD_SCALE)
        .ok_or(VaultError::MathOverflow)?;

    record.shares = record
        .shares
        .checked_add(shares)
        .ok_or(VaultError::MathOverflow)?;
    record.principal = record
        .principal
        .checked_add(amount)
        .ok_or(VaultError::MathOverflow)?;
    record.reward_debt = record
        .reward_debt
        .checked_add(reward_debt)
        .ok_or(VaultError::MathOverflow)?;
    record.deposited_at = clock.unix_timestamp;

    emit!(DepositEvent {
        wallet: ctx.accounts.depositor.key(),
        amount,
        shares,
        vault_id: vault.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
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
