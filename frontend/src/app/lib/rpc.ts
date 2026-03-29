import { clusterApiUrl, Connection } from '@solana/web3.js';

const getEndpoint = (): string => {
  if (process.env.NEXT_PUBLIC_RPC_ENDPOINT) {
    return process.env.NEXT_PUBLIC_RPC_ENDPOINT;
  }
  
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  
  if (network === 'mainnet-beta') {
    return process.env.NEXT_PUBLIC_MAINNET_RPC || clusterApiUrl('mainnet-beta');
  }
  
  if (network === 'testnet') {
    return clusterApiUrl('testnet');
  }
  
  return process.env.NEXT_PUBLIC_DEVNET_RPC || clusterApiUrl('devnet');
};

export const RPC_ENDPOINT = getEndpoint();

export const connection = new Connection(RPC_ENDPOINT, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
});

export const getCluster = (): string => {
  return process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
};

export const isDevnet = getCluster() === 'devnet';
export const isMainnet = getCluster() === 'mainnet-beta';
