use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::state::VaultState;

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = authority,
        space = VaultState::SPACE,
        seeds = [b"vault", authority.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultState>,

    /// CHECK: We are just creating the PDA token account to hold funds
    #[account(
        init,
        payer = authority,
        seeds = [b"vault-token", vault.key().as_ref()],
        bump,
        token::mint = accepted_mint,
        token::authority = vault,
        token::token_program = token_program,
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    pub accepted_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handle_initialize_vault(
    ctx: Context<InitializeVault>,
    deposit_cap: u64,
    min_deposit: u64,
    current_apy: u16,
    allowed_jurisdictions: Vec<[u8; 2]>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.authority = ctx.accounts.authority.key();
    vault.accepted_mint = ctx.accounts.accepted_mint.key();
    vault.total_deposits = 0;
    vault.deposit_cap = deposit_cap;
    vault.min_deposit = min_deposit;
    vault.current_apy = current_apy;
    vault.accrued_yield = 0;
    vault.last_yield_update = Clock::get()?.unix_timestamp;
    vault.allowed_jurisdictions = allowed_jurisdictions;
    vault.is_paused = false;
    vault.depositor_count = 0;
    vault.bump = ctx.bumps.vault;

    Ok(())
}
