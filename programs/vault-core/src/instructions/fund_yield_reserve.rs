use crate::{errors::VaultError, events::YieldReserveFunded, state::VaultState};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct FundYieldReserve<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.authority.as_ref()],
        bump = vault.bump,
        constraint = vault.authority == authority.key() @ VaultError::Unauthorized
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = authority,
    )]
    pub source_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = accepted_mint,
        token::authority = vault,
    )]
    pub yield_reserve_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub accepted_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_fund_yield_reserve(ctx: Context<FundYieldReserve>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::BelowMinimum);

    let cpi_accounts = TransferChecked {
        from: ctx.accounts.source_token_account.to_account_info(),
        mint: ctx.accounts.accepted_mint.to_account_info(),
        to: ctx.accounts.yield_reserve_account.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    transfer_checked(cpi_ctx, amount, ctx.accounts.accepted_mint.decimals)?;

    emit!(YieldReserveFunded {
        authority: ctx.accounts.authority.key(),
        amount,
        vault_id: ctx.accounts.vault.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
