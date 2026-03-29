'use client';

import { useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';

export function useWalletAdapters() {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
    ],
    []
  );

  return wallets;
}

export function useWalletPublicKey() {
  const { publicKey, connected } = useWallet();

  return {
    publicKey: publicKey?.toBase58() || null,
    connected,
    rawPublicKey: publicKey,
  };
}
