'use client';

import React, { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import '@solana/wallet-adapter-react-ui/styles.css';

const getEndpoint = (): string => {
  if (process.env.NEXT_PUBLIC_RPC_ENDPOINT) {
    return process.env.NEXT_PUBLIC_RPC_ENDPOINT;
  }
  
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  
  if (network === 'mainnet-beta') {
    return process.env.NEXT_PUBLIC_MAINNET_RPC || clusterApiUrl('mainnet-beta');
  }
  
  return process.env.NEXT_PUBLIC_DEVNET_RPC || clusterApiUrl('devnet');
};

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const network = getEndpoint();

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
        ],
        []
    );

    return (
        <ConnectionProvider endpoint={network}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};
