import {
  startAnchor,
  Clock,
  BanksClient,
  ProgramTestContext,
} from "solana-bankrun";
import { BankrunProvider } from "anchor-bankrun";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, Transaction } from "@solana/web3.js";
import { Token, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";

const VAULT_CORE_PROGRAM_ID = "5dcD4DiSDev9Tp5cH1zEC1wXi2QdTnwakwZ5b3R7UZQT";
const ACCESS_REGISTRY_PROGRAM_ID = "CEGdcutb947V2BmcCPhmqL2dfjuBGk4GPF34dJtP2y3c";

describe("vault-core", () => {
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let vaultProgram: anchor.Program;
  let accessProgram: anchor.Program;
  let banksClient: BanksClient;
  let authority: Keypair;
  let depositor: Keypair;
  let mint: Keypair;
  let depositorTokenAccount: PublicKey;
  let clock: Clock;

  before(async () => {
    context = await startAnchor(
      [
        { name: "access_registry", programId: ACCESS_REGISTRY_PROGRAM_ID },
        { name: "vault_core", programId: VAULT_CORE_PROGRAM_ID },
      ],
      [],
      {}
    );

    provider = new BankrunProvider(context);
    banksClient = context.banksClient;
    vaultProgram = await anchor.Program.at(VAULT_CORE_PROGRAM_ID, provider);
    accessProgram = await anchor.Program.at(ACCESS_REGISTRY_PROGRAM_ID, provider);

    authority = context.payer;
    depositor = Keypair.generate();
    mint = Keypair.generate();

    clock = await banksClient.getClock();
  });

  async function createTokenAccount(
    owner: PublicKey,
    mint: PublicKey,
    authority: Keypair
  ): Promise<PublicKey> {
    const account = Keypair.generate();
    const tx = new Transaction();
    
    tx.add(
      await Token.createInitAccountInstruction(
        TOKEN_PROGRAM_ID,
        mint,
        account.publicKey,
        owner
      )
    );

    await provider.sendAndConfirm(tx, [account, authority], { maxRetries: 5 });
    return account.publicKey;
  }

  async function mintTokens(
    to: PublicKey,
    mint: PublicKey,
    amount: number,
    authority: Keypair
  ): Promise<void> {
    const tx = new Transaction();
    tx.add(
      Token.createMintToInstruction(
        TOKEN_PROGRAM_ID,
        mint,
        to,
        authority.publicKey,
        [],
        amount
      )
    );
    await provider.sendAndConfirm(tx, [authority], { maxRetries: 5 });
  }

  it("initialize vault + deposit + withdraw with yield", async () => {
    const depositAmount = new anchor.BN(10_000_000); // 10 tokens with 6 decimals
    
    // 1. Create mint
    const tx = new Transaction();
    tx.add(
      await Token.createInitMintInstruction(
        TOKEN_PROGRAM_ID,
        mint.publicKey,
        6,
        authority.publicKey,
        null
      )
    );
    await provider.sendAndConfirm(tx, [mint], { maxRetries: 5 });

    // 2. Create depositor token account and mint tokens
    depositorTokenAccount = await createTokenAccount(
      depositor.publicKey,
      mint.publicKey,
      authority
    );
    await mintTokens(
      depositorTokenAccount,
      mint.publicKey,
      100_000_000, // 100 tokens
      authority
    );

    // 3. Initialize access registry
    const [registryConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from("registry-config")],
      new PublicKey(ACCESS_REGISTRY_PROGRAM_ID)
    );

    await vaultProgram.methods
      .initializeRegistry()
      .accounts({
        config: registryConfig,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // 4. Create wallet record for depositor
    const [walletRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from("wallet-record"), depositor.publicKey.toBuffer()],
      new PublicKey(ACCESS_REGISTRY_PROGRAM_ID)
    );

    const futureTime = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now

    await accessProgram.methods
      .upsertWalletRecord(
        Buffer.from("US"), // jurisdiction
        2, // tier
        new anchor.BN(futureTime),
        false // is_sanctioned
      )
      .accounts({
        walletRecord: walletRecord,
        wallet: depositor.publicKey,
        config: registryConfig,
        oracle: authority.publicKey,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // 5. Initialize vault
    const [vaultState] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), authority.publicKey.toBuffer()],
      new PublicKey(VAULT_CORE_PROGRAM_ID)
    );

    const [vaultTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault-tokens"), vaultState.toBuffer()],
      new PublicKey(VAULT_CORE_PROGRAM_ID)
    );

    const [yieldReserve] = PublicKey.findProgramAddressSync(
      [Buffer.from("yield-reserve"), vaultState.toBuffer()],
      new PublicKey(VAULT_CORE_PROGRAM_ID)
    );

    await vaultProgram.methods
      .initializeVault(
        new anchor.BN(1_000_000_000_000), // deposit_cap
        new anchor.BN(1_000_000), // min_deposit (0.001 tokens)
        500, // yield_rate_bps (5% APY)
        [Buffer.from("US")]
      )
      .accounts({
        vault: vaultState,
        vaultTokenAccount: vaultTokenAccount,
        yieldReserveAccount: yieldReserve,
        authority: authority.publicKey,
        acceptedMint: mint.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Verify vault is initialized
    const vault = await vaultProgram.account.vaultState.fetch(vaultState);
    expect(vault.authority.toString()).to.equal(authority.publicKey.toString());
    expect(vault.totalDeposits.toString()).to.equal("0");
    expect(vault.totalShares.toString()).to.equal("0");

    // 6. Make deposit
    await vaultProgram.methods
      .deposit(depositAmount)
      .accounts({
        vault: vaultState,
        vaultTokenAccount: vaultTokenAccount,
        depositorTokenAccount: depositorTokenAccount,
        depositor: depositor.publicKey,
        walletRecord: walletRecord,
        acceptedMint: mint.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        accessRegistryProgram: ACCESS_REGISTRY_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    // Verify deposit
    const vaultAfterDeposit = await vaultProgram.account.vaultState.fetch(vaultState);
    expect(vaultAfterDeposit.totalDeposits.toString()).to.equal(depositAmount.toString());
    expect(vaultAfterDeposit.totalShares.toString()).to.equal(depositAmount.toString());
    expect(vaultAfterDeposit.depositorCount).to.equal(1);

    // Get deposit record
    const [depositRecord] = PublicKey.findProgramAddressSync(
      [Buffer.from("deposit"), vaultState.toBuffer(), depositor.publicKey.toBuffer()],
      new PublicKey(VAULT_CORE_PROGRAM_ID)
    );
    const record = await vaultProgram.account.depositRecord.fetch(depositRecord);
    expect(record.shares.toString()).to.equal(depositAmount.toString());
    expect(record.principal.toString()).to.equal(depositAmount.toString());

    // 7. Advance time to generate yield (advance 1 year)
    context = await startAnchor(
      [
        { name: "access_registry", programId: ACCESS_REGISTRY_PROGRAM_ID },
        { name: "vault_core", programId: VAULT_CORE_PROGRAM_ID },
      ],
      [],
      {}
    );
    provider = new BankrunProvider(context);
    banksClient = context.banksClient;
    
    const newVaultProgram = await anchor.Program.at(VAULT_CORE_PROGRAM_ID, provider);
    
    // Warp time forward by 1 year (in seconds)
    await context.warpToSlot(31536000 * 2); // 2 years worth of slots (assuming 1 slot = 0.4s)

    // 8. Call accrue_yield
    await newVaultProgram.methods
      .accrueYield()
      .accounts({
        vault: vaultState,
      })
      .rpc();

    // Verify yield was accrued
    const vaultWithYield = await newVaultProgram.account.vaultState.fetch(vaultState);
    expect(vaultWithYield.accumulatedYieldPerShare.toString()).to.not.equal("0");
    expect(vaultWithYield.totalYieldDistributed.toString()).to.not.equal("0");

    // 9. Withdraw
    // Need to recreate depositor token account after warp
    const newDepositorTokenAccount = await createTokenAccount(
      depositor.publicKey,
      mint.publicKey,
      authority
    );
    await mintTokens(
      newDepositorTokenAccount,
      mint.publicKey,
      100_000_000,
      authority
    );

    const withdrawAmount = new anchor.BN(5_000_000); // Withdraw half

    await newVaultProgram.methods
      .withdraw(withdrawAmount)
      .accounts({
        vault: vaultState,
        depositRecord: depositRecord,
        vaultTokenAccount: vaultTokenAccount,
        yieldReserveAccount: yieldReserve,
        depositorTokenAccount: newDepositorTokenAccount,
        depositor: depositor.publicKey,
        acceptedMint: mint.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([depositor])
      .rpc();

    // Verify withdrawal
    const vaultAfterWithdraw = await newVaultProgram.account.vaultState.fetch(vaultState);
    expect(vaultAfterWithdraw.totalDeposits.toString()).to.equal(withdrawAmount.toString());
    
    const recordAfter = await newVaultProgram.account.depositRecord.fetch(depositRecord);
    expect(recordAfter.principal.toString()).to.equal(withdrawAmount.toString());

    console.log("Test completed successfully!");
    console.log("Yield distributed:", vaultWithYield.totalYieldDistributed.toString());
  });
});
