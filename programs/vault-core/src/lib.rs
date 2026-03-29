use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("3FQsKPw1T2X2NP87cfaxjNZzkq3M3PJ6FVcddAogowyq");

#[program]
pub mod vault_core {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        deposit_cap: u64,
        min_deposit: u64,
        current_apy: u16,
        allowed_jurisdictions: Vec<[u8; 2]>,
    ) -> Result<()> {
        handle_initialize_vault(ctx, deposit_cap, min_deposit, current_apy, allowed_jurisdictions)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        handle_deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        handle_withdraw(ctx, amount)
    }

    pub fn update_vault_config(
        ctx: Context<UpdateVaultConfig>,
        deposit_cap: Option<u64>,
        min_deposit: Option<u64>,
        current_apy: Option<u16>,
        allowed_jurisdictions: Option<Vec<[u8; 2]>>,
        is_paused: Option<bool>,
    ) -> Result<()> {
        handle_update_config(ctx, deposit_cap, min_deposit, current_apy, allowed_jurisdictions, is_paused)
    }

    pub fn accrue_yield(ctx: Context<AccrueYield>) -> Result<()> {
        handle_accrue_yield(ctx)
    }
}
