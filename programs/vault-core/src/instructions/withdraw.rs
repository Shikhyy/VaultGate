use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::{state::{VaultState, DepositReceipt}, errors::VaultError, events::WithdrawEvent};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        // Withdraw works even if paused per FR-SC-06
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        mut,
        seeds = [b"receipt", vault.key().as_ref(), depositor.key().as_ref()],
        bump = deposit_receipt.bump,
        constraint = deposit_receipt.depositor == depositor.key() @ VaultError::Unauthorized
    )]
    pub deposit_receipt: Account<'info, DepositReceipt>,

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

    pub accepted_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let receipt = &mut ctx.accounts.deposit_receipt;
    let clock = Clock::get()?;

    require!(amount > 0, VaultError::BelowMinimum);
    require!(receipt.amount >= amount, VaultError::InsufficientFunds);

    // Mock yield calculation
    // Yield = Principal * (APY / 10000) * (Time elapsed / 1 year)
    let time_elapsed = clock.unix_timestamp - receipt.deposited_at;
    let seconds_in_year = 31536000;
    
    // Care with fractional division, APY is base points
    let yield_amount = (receipt.amount as u128)
        .checked_mul(vault.current_apy as u128).unwrap()
        .checked_mul(time_elapsed as u128).unwrap()
        .checked_div(10000).unwrap()
        .checked_div(seconds_in_year as u128).unwrap() as u64;

    // We only pay yield based on the proportion of principal withdrawn
    // For simplicity of hackathon, we pay out all yield accrued on withdrawal,
    // and reset the timer.
    let total_transfer = amount.checked_add(yield_amount).unwrap();

    let authority_key = vault.authority.key();
    let seeds = &[
        b"vault".as_ref(),
        authority_key.as_ref(),
        &[vault.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.vault_token_account.to_account_info(),
        mint: ctx.accounts.accepted_mint.to_account_info(),
        to: ctx.accounts.depositor_token_account.to_account_info(),
        authority: vault.to_account_info(),
    };
    
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(), 
        cpi_accounts,
        signer_seeds
    );
    
    transfer_checked(cpi_ctx, total_transfer, ctx.accounts.accepted_mint.decimals)?;

    // Update state
    receipt.amount = receipt.amount.checked_sub(amount).unwrap();
    receipt.yield_claimed = receipt.yield_claimed.checked_add(yield_amount).unwrap();
    receipt.deposited_at = clock.unix_timestamp; // reset timer

    vault.total_deposits = vault.total_deposits.checked_sub(amount).unwrap();

    emit!(WithdrawEvent {
        wallet: ctx.accounts.depositor.key(),
        amount,
        yield_amount,
        vault_id: vault.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
