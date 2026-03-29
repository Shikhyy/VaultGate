use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{ExecuteInstruction, TransferHookInstruction};

pub mod errors;
pub mod events;

use errors::*;
use events::*;

use access_registry::WalletRecord;
use vault_core::state::VaultState;

declare_id!("BANmT4cxvACA68TAvJGdp6Fuk2g6xfFkfWzq2QmkfBVa");

#[program]
pub mod kyc_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
        vault_bump: u8,
        vault_authority: Pubkey,
    ) -> Result<()> {
        let mint = ctx.accounts.mint.key();

        let vault_seeds: &[&[u8]] = &[b"vault", vault_authority.as_ref(), &[vault_bump]];

        let wallet_record_seeds: &[&[u8]] = &[b"wallet-record"];

        let account_metas = vec![
            ExtraAccountMeta::new_with_seeds(
                &[Seed::Literal {
                    bytes: vault_seeds.to_vec(),
                }],
                false,
                false,
            )?,
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: wallet_record_seeds.to_vec(),
                    },
                    Seed::AccountKey { index: 3 },
                ],
                false,
                false,
            )?,
        ];

        let extra_account_meta_list =
            ExtraAccountMetaList::init::<&ExtraAccountMeta>(&account_metas)?;

        ctx.accounts
            .extra_account_meta_list
            .data_dir()
            .try_write_bytes(extra_account_meta_list.try_to_vec()?.as_slice())?;

        Ok(())
    }

    pub fn fallback<'info>(
        program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        instruction_data: &[u8],
    ) -> Result<()> {
        let instruction = TransferHookInstruction::unpack(instruction_data)?;

        match instruction {
            TransferHookInstruction::Execute { amount } => {
                let amount_bytes = amount.to_le_bytes();
                __private::__global::transfer_hook(program_id, accounts, &amount_bytes)
            }
            _ => return Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    #[account(
        address = spl_token::ID @ ProgramError::IncorrectProgramId
    )]
    /// CHECK: Source token account
    pub source_token: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        address = spl_token::ID @ ProgramError::IncorrectProgramId
    )]
    /// CHECK: Destination token account
    pub destination_token: AccountInfo<'info>,

    /// CHECK: Source authority
    pub source_authority: AccountInfo<'info>,

    /// CHECK: ExtraAccountMetaList account
    pub extra_account_meta_list: AccountInfo<'info>,

    pub vault: Account<'info, VaultState>,

    pub wallet_record: Account<'info, WalletRecord>,
}

#[access_control(transfer_hook_constraints(&ctx))]
pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
    let registry = &ctx.accounts.wallet_record;
    let sender = ctx.accounts.source_authority.key();
    let vault = &ctx.accounts.vault;

    require!(registry.is_whitelisted(), HookError::NotKycVerified);

    require!(!registry.is_sanctioned(), HookError::SanctionedAddress);

    require!(
        registry.expires_at > Clock::get()?.unix_timestamp,
        HookError::KycExpired
    );

    let allowed_jurisdictions: Vec<[u8; 2]> = vault
        .allowed_jurisdictions
        .iter()
        .take(vault.jurisdiction_count as usize)
        .cloned()
        .collect();

    require!(
        registry.jurisdiction_allowed(&allowed_jurisdictions),
        HookError::JurisdictionNotAllowed
    );

    emit!(TransferChecked {
        wallet: sender,
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn transfer_hook_constraints(ctx: &Context<TransferHook>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.wallet_record.wallet,
        ctx.accounts.source_authority.key(),
        HookError::NotKycVerified
    );
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = ExtraAccountMetaList::size_of(2).unwrap() + 8,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}
