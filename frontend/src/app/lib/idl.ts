import type { Provider, BN } from '@coral-xyz/anchor';
import { Program, AnchorProvider, web3 } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';

export const IDL_VERSION = '0.1.0' as const;

export const VAULT_CORE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_VAULT_CORE_PROGRAM_ID || 'VaultCore1111111111111111111111111111111'
);

export const ACCESS_REGISTRY_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ACCESS_REGISTRY_PROGRAM_ID || 'AccessRegistry1111111111111111111111111111'
);

export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSQhM9a4oS3Qj3p2aY8Ym2w8r1B7X3oA');

export interface VaultState {
  authority: PublicKey;
  acceptedMint: PublicKey;
  vaultTokenAccount: PublicKey;
  yieldReserveAccount: PublicKey;
  depositCap: BN;
  minDeposit: BN;
  totalDeposits: BN;
  totalShares: BN;
  accumulatedYieldPerShare: BN;
  yieldRateBps: number;
  lastYieldAccrual: BN;
  totalYieldDistributed: BN;
  allowedJurisdictions: number[][];
  jurisdictionCount: number;
  isPaused: boolean;
  depositorCount: number;
  bump: number;
}

export interface DepositRecord {
  vault: PublicKey;
  depositor: PublicKey;
  shares: BN;
  principal: BN;
  rewardDebt: BN;
  depositedAt: BN;
  bump: number;
}

export interface WalletRecord {
  wallet: PublicKey;
  jurisdiction: number[];
  tier: number;
  verifiedAt: BN;
  expiresAt: BN;
  isSanctioned: boolean;
  bump: number;
}

export interface VaultEvent {
  timestamp: number;
  action: 'deposit' | 'withdraw' | 'yield_claim' | 'kyc_update';
  amount: number;
  user: string;
  txHash: string;
}

export const MOCK_VAULT_STATE: VaultState = {
  authority: new PublicKey('AMINA_Treasury_Multisig111111111111111111'),
  acceptedMint: USDC_MINT,
  vaultTokenAccount: new PublicKey('VaultTokenAccount111111111111111111111111'),
  yieldReserveAccount: new PublicKey('YieldReserve11111111111111111111111111111'),
  depositCap: new BN(100000000),
  minDeposit: new BN(10000),
  totalDeposits: new BN(45000000),
  totalShares: new BN(45000000),
  accumulatedYieldPerShare: new BN(0),
  yieldRateBps: 840,
  lastYieldAccrual: new BN(1698163200),
  totalYieldDistribut: new BN(1250000),
  allowedJurisdictions: [
    [67, 72],
    [85, 83],
    [76, 73],
  ],
  jurisdictionCount: 3,
  isPaused: false,
  depositorCount: 14,
  bump: 255,
};

export const MOCK_WHITELIST: WalletRecord[] = [
  {
    wallet: new PublicKey('5XyT7rq89pA123456789012345678901234567890'),
    jurisdiction: [67, 72],
    tier: 3,
    verifiedAt: new BN(1698124800),
    expiresAt: new BN(1739667200),
    isSanctioned: false,
    bump: 255,
  },
  {
    wallet: new PublicKey('9MnL3k1m31B234567890123456789012345678901'),
    jurisdiction: [85, 83],
    tier: 2,
    verifiedAt: new BN(1695408000),
    expiresAt: new BN(1726876800),
    isSanctioned: false,
    bump: 254,
  },
];

export const MOCK_EVENTS: VaultEvent[] = [
  {
    timestamp: 1698163200,
    action: 'deposit',
    amount: 750000,
    user: '5XyT7rq89pA123456789012345678901234567890',
    txHash: '5XyT7rq89pA123456789012345678901234567890abc123def',
  },
  {
    timestamp: 1693507200,
    action: 'deposit',
    amount: 500000,
    user: '9MnL3k1m31B234567890123456789012345678901',
    txHash: '9MnL3k1m31B234567890123456789012345678901def456ghi',
  },
];

export const JURISDICTION_LABELS: Record<string, string> = {
  'CH': 'Switzerland',
  'US': 'United States',
  'LI': 'Liechtenstein',
  'DE': 'Germany',
  'GB': 'United Kingdom',
  'SG': 'Singapore',
  'JP': 'Japan',
  'AU': 'Australia',
};

export const TIER_LABELS: Record<number, string> = {
  1: 'Retail',
  2: 'Institutional',
  3: 'Prime',
};

export function getJurisdictionString(jurisdiction: number[]): string {
  if (jurisdiction.length !== 2) return 'Unknown';
  return String.fromCharCode(jurisdiction[0]) + String.fromCharCode(jurisdiction[1]);
}

export function findVaultStatePda(authority: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), authority.toBuffer()],
    VAULT_CORE_PROGRAM_ID
  );
  return pda;
}

export function findDepositRecordPda(vault: PublicKey, depositor: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('deposit'), vault.toBuffer(), depositor.toBuffer()],
    VAULT_CORE_PROGRAM_ID
  );
  return pda;
}

export function findWalletRecordPda(wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('wallet-record'), wallet.toBuffer()],
    ACCESS_REGISTRY_PROGRAM_ID
  );
  return pda;
}

export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey
): PublicKey {
  return web3.AssociatedTokenProgram.findAssociatedTokenAddress(mint, owner);
}
