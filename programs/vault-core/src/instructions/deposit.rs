use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::{state::{VaultState, DepositReceipt}, errors::VaultError, events::DepositEvent};
use access_registry::WalletRecord;

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
        space = DepositReceipt::SPACE,
        seeds = [b"receipt", vault.key().as_ref(), depositor.key().as_ref()],
        bump
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

    // Verification against access-registry
    #[account(
        seeds = [b"wallet-record", depositor.key().as_ref()],
        bump = wallet_record.bump,
        seeds::program = access_registry_program.key()
    )]
    pub wallet_record: Account<'info, WalletRecord>,
    
    /// CHECK: verifying correct registry program
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
    
    let new_total = vault.total_deposits.checked_add(amount).ok_or(VaultError::MathOverflow)?;
    require!(new_total <= vault.deposit_cap, VaultError::CapExceeded);

    // KYC Checks
    let record = &ctx.accounts.wallet_record;
    require!(!record.is_sanctioned, VaultError::SanctionedAddress);
    require!(record.expires_at > clock.unix_timestamp, VaultError::KycExpired);
    
    // Check jurisdiction 
    let allowed = vault.allowed_jurisdictions.iter().any(|j| j == &record.jurisdiction);
    require!(allowed, VaultError::JurisdictionNotAllowed);

    // Transfer limits checked out, do transfer
    let transfer_cpi_accounts = TransferChecked {
        from: ctx.accounts.depositor_token_account.to_account_info(),
        mint: ctx.accounts.accepted_mint.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.depositor.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), transfer_cpi_accounts);
    transfer_checked(cpi_ctx, amount, ctx.accounts.accepted_mint.decimals)?;

    // Update state
    vault.total_deposits = new_total;
    
    let receipt = &mut ctx.accounts.deposit_receipt;
    if receipt.amount == 0 {
        // New depositor
        vault.depositor_count = vault.depositor_count.checked_add(1).unwrap();
        receipt.vault = vault.key();
        receipt.depositor = ctx.accounts.depositor.key();
        receipt.bump = ctx.bumps.deposit_receipt;
        receipt.yield_claimed = 0;
    }
    receipt.amount = receipt.amount.checked_add(amount).unwrap();
    receipt.deposited_at = clock.unix_timestamp;

    emit!(DepositEvent {
        wallet: ctx.accounts.depositor.key(),
        amount,
        vault_id: vault.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
