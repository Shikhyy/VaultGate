use anchor_lang::prelude::*;
use anchor_spl::token::ID as TOKEN_PROGRAM_ID;
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::{
    ExecuteInstruction, InitializeExtraAccountMetaListInstruction, TransferHookInstruction,
};

pub mod errors;
pub mod events;

use errors::*;
use events::*;

use access_registry::WalletRecord;
use vault_core::VaultState;

declare_id!("BANmT4cxvACA68TAvJGdp6Fuk2g6xfFkfWzq2QmkfBVa");

#[program]
pub mod kyc_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
        vault_bump: u8,
        vault_authority: Pubkey,
    ) -> Result<()> {
        let vault_seeds: Vec<u8> = [
            b"vault".to_vec(),
            vault_authority.to_bytes().to_vec(),
            vec![vault_bump],
        ]
        .concat();

        let wallet_record_seeds: &[&[u8]] = &[b"wallet-record"];

        let account_metas = vec![
            ExtraAccountMeta::new_with_seeds(
                &[Seed::Literal { bytes: vault_seeds }],
                false,
                false,
            )?,
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: wallet_record_seeds.concat(),
                    },
                    Seed::AccountKey { index: 3 },
                ],
                false,
                false,
            )?,
        ];

        let extra_account_meta_list = ExtraAccountMetaList::init::<
            InitializeExtraAccountMetaListInstruction,
        >(&mut [], &account_metas)?;

        let data = extra_account_meta_list.try_to_vec()?;

        let meta_list = ctx.accounts.extra_account_meta_list.to_account_info();
        meta_list.data.borrow_mut().copy_from_slice(&data);

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
                execute_transfer_hook(program_id, accounts, amount)
            }
            _ => return Err(ProgramError::InvalidInstructionData.into()),
        }
    }
}

fn execute_transfer_hook<'info>(
    _program_id: &Pubkey,
    accounts: &'info [AccountInfo<'info>],
    amount: u64,
) -> Result<()> {
    if accounts.len() < 7 {
        return Err(ProgramError::NotEnoughAccountKeys.into());
    }

    let source_authority = &accounts[3];
    let vault_info = &accounts[5];
    let wallet_record_info = &accounts[6];

    let vault_data = vault_info.try_borrow_data()?;
    let vault_state = VaultState::try_deserialize(&mut vault_data.as_ref())?;
    drop(vault_data);

    let wallet_record_data = wallet_record_info.try_borrow_data()?;
    let wallet = WalletRecord::try_deserialize(&mut wallet_record_data.as_ref())?;
    drop(wallet_record_data);

    require!(wallet.is_whitelisted(), HookError::NotKycVerified);
    require!(!wallet.is_sanctioned(), HookError::SanctionedAddress);
    require!(
        wallet.expires_at > Clock::get()?.unix_timestamp,
        HookError::KycExpired
    );

    let allowed_jurisdictions: Vec<[u8; 2]> = vault_state
        .allowed_jurisdictions
        .iter()
        .take(vault_state.jurisdiction_count as usize)
        .cloned()
        .collect();

    require!(
        wallet.jurisdiction_allowed(&allowed_jurisdictions),
        HookError::JurisdictionNotAllowed
    );

    emit!(TransferChecked {
        wallet: source_authority.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

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
