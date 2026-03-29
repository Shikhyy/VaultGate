import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { VAULT_CORE_PROGRAM_ID, ACCESS_REGISTRY_PROGRAM_ID } from './idl';

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

let cachedProvider: AnchorProvider | null = null;
let cachedConnection: Connection | null = null;

export function getConnection(): Connection {
  if (cachedConnection) return cachedConnection;
  
  const endpoint = process.env.NEXT_PUBLIC_RPC_ENDPOINT || 
    (process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta' 
      ? process.env.NEXT_PUBLIC_MAINNET_RPC 
      : process.env.NEXT_PUBLIC_DEVNET_RPC) ||
    web3.clusterApiUrl('devnet');

  cachedConnection = new Connection(endpoint, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
  
  return cachedConnection;
}

export function getProvider(walletAdapter?: web3.Wallet): AnchorProvider {
  if (cachedProvider) return cachedProvider;
  
  const connection = getConnection();
  const provider = new AnchorProvider(connection, walletAdapter || new web3WalletAdapter(), {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
  });
  
  cachedProvider = provider;
  return provider;
}

class web3WalletAdapter implements web3.Wallet {
  constructor() {}
  
  async signTransaction(tx: Transaction): Promise<Transaction> {
    throw new Error('Wallet not connected');
  }
  
  async signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
    throw new Error('Wallet not connected');
  }
  
  get publicKey(): PublicKey | null {
    return null;
  }
}

export interface VaultDepositParams {
  amount: BN;
}

export interface VaultWithdrawParams {
  amount: BN;
}

export async function buildDepositTransaction(
  provider: AnchorProvider,
  depositor: PublicKey,
  amount: BN
): Promise<Transaction> {
  const vaultAuthority = new PublicKey(
    process.env.NEXT_PUBLIC_VAULT_AUTHORITY || 'AMINA_Treasury_Multisig111111111111111111'
  );
  
  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), vaultAuthority.toBuffer()],
    VAULT_CORE_PROGRAM_ID
  );

  const [depositRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('deposit'), vaultStatePda.toBuffer(), depositor.toBuffer()],
    VAULT_CORE_PROGRAM_ID
  );

  const userTokenAccount = web3.AssociatedTokenProgram.findAssociatedTokenAddress(
    new PublicKey('EPjFWdd5AufqSSQhM9a4oS3Qj3p2aY8Ym2w8r1B7X3oA'),
    depositor
  );

  const tx = new Transaction();
  
  tx.add(
    web3.SystemProgram.transfer({
      fromPubkey: depositor,
      toPubkey: depositRecordPda,
      lamports: 10000000,
    }),
    new web3.TransactionInstruction({
      programId: VAULT_CORE_PROGRAM_ID,
      keys: [
        { pubkey: vaultStatePda, isWritable: true, isSigner: false },
        { pubkey: depositor, isWritable: true, isSigner: true },
        { pubkey: depositRecordPda, isWritable: true, isSigner: false },
        { pubkey: userTokenAccount, isWritable: true, isSigner: false },
        { pubkey: web3.SYSVAR_RENT_PUBKEY, isSigner: false },
        { pubkey: web3.SystemProgram.programId, isSigner: false },
        { pubkey: web3.TokenProgram.programId, isSigner: false },
      ],
      data: Buffer.from([
        0,
        ...amount.toArray('le', 8),
      ]),
    })
  );

  return tx;
}

export async function buildWithdrawTransaction(
  provider: AnchorProvider,
  depositor: PublicKey,
  amount: BN
): Promise<Transaction> {
  const vaultAuthority = new PublicKey(
    process.env.NEXT_PUBLIC_VAULT_AUTHORITY || 'AMINA_Treasury_Multisig111111111111111111'
  );
  
  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), vaultAuthority.toBuffer()],
    VAULT_CORE_PROGRAM_ID
  );

  const [depositRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('deposit'), vaultStatePda.toBuffer(), depositor.toBuffer()],
    VAULT_CORE_PROGRAM_ID
  );

  const userTokenAccount = web3.AssociatedTokenProgram.findAssociatedTokenAddress(
    new PublicKey('EPjFWdd5AufqSSQhM9a4oS3Qj3p2aY8Ym2w8r1B7X3oA'),
    depositor
  );

  const tx = new Transaction();
  
  tx.add(
    new web3.TransactionInstruction({
      programId: VAULT_CORE_PROGRAM_ID,
      keys: [
        { pubkey: vaultStatePda, isWritable: true, isSigner: false },
        { pubkey: depositor, isWritable: true, isSigner: true },
        { pubkey: depositRecordPda, isWritable: true, isSigner: false },
        { pubkey: userTokenAccount, isWritable: true, isSigner: false },
        { pubkey: web3.TokenProgram.programId, isSigner: false },
      ],
      data: Buffer.from([
        1,
        ...amount.toArray('le', 8),
      ]),
    })
  );

  return tx;
}

export async function fetchVaultState(
  connection: Connection,
  authority: PublicKey
): Promise<any | null> {
  const [vaultStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), authority.toBuffer()],
    VAULT_CORE_PROGRAM_ID
  );

  try {
    const accountInfo = await connection.getAccountInfo(vaultStatePda);
    if (!accountInfo) return null;
    
    return accountInfo;
  } catch (error) {
    console.error('Error fetching vault state:', error);
    return null;
  }
}

export async function fetchDepositRecord(
  connection: Connection,
  vault: PublicKey,
  depositor: PublicKey
): Promise<any | null> {
  const [depositRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('deposit'), vault.toBuffer(), depositor.toBuffer()],
    VAULT_CORE_PROGRAM_ID
  );

  try {
    const accountInfo = await connection.getAccountInfo(depositRecordPda);
    if (!accountInfo) return null;
    
    return accountInfo;
  } catch (error) {
    console.error('Error fetching deposit record:', error);
    return null;
  }
}

export async function fetchWalletRecord(
  connection: Connection,
  wallet: PublicKey
): Promise<any | null> {
  const [walletRecordPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('wallet-record'), wallet.toBuffer()],
    ACCESS_REGISTRY_PROGRAM_ID
  );

  try {
    const accountInfo = await connection.getAccountInfo(walletRecordPda);
    if (!accountInfo) return null;
    
    return accountInfo;
  } catch (error) {
    console.error('Error fetching wallet record:', error);
    return null;
  }
}

export { isDemoMode };
