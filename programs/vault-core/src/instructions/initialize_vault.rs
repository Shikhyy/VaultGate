use crate::events::VaultInitialized;
use crate::state::{VaultState, MAX_JURISDICTIONS};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

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

    #[account(
        init,
        payer = authority,
        token::mint = accepted_mint,
        token::authority = vault,
        seeds = [b"vault-tokens", vault.key().as_ref()],
        bump
    )]
    pub vault_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        token::mint = accepted_mint,
        token::authority = vault,
        seeds = [b"yield-reserve", vault.key().as_ref()],
        bump
    )]
    pub yield_reserve_account: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub accepted_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_initialize_vault(
    ctx: Context<InitializeVault>,
    deposit_cap: u64,
    min_deposit: u64,
    current_apy: u16,
    allowed_jurisdictions: Vec<[u8; 2]>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.authority = ctx.accounts.authority.key();
    vault.accepted_mint = ctx.accounts.accepted_mint.key();
    vault.vault_token_account = ctx.accounts.vault_token_account.key();
    vault.yield_reserve_account = ctx.accounts.yield_reserve_account.key();
    vault.deposit_cap = deposit_cap;
    vault.min_deposit = min_deposit;
    vault.total_deposits = 0;
    vault.total_shares = 0;
    vault.accumulated_yield_per_share = 0;
    vault.yield_rate_bps = current_apy;
    vault.last_yield_accrual = clock.unix_timestamp;
    vault.total_yield_distributed = 0;
    vault.allowed_jurisdictions = [[0u8; 2]; MAX_JURISDICTIONS];
    vault.jurisdiction_count = 0;
    vault.is_paused = false;
    vault.depositor_count = 0;
    vault.bump = ctx.bumps.vault;

    emit!(VaultInitialized {
        vault: vault.key(),
        authority: vault.authority,
        accepted_mint: vault.accepted_mint,
        vault_token_account: vault.vault_token_account,
        yield_reserve_account: vault.yield_reserve_account,
        deposit_cap,
        min_deposit,
        current_apy,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
