'use client';

import React from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import dynamic from 'next/dynamic';
import { Shield } from 'lucide-react';

const WalletMultiButton = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export function Navbar() {
  const { connected } = useWallet();

  return (
    <nav style={{ padding: '24px 0', borderBottom: '1px solid var(--border-glass)' }}>
      <div className="container flex-between">
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Shield size={32} color="var(--accent-gold)" />
          <span style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
            VaultGate
          </span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {connected && (
            <>
              <Link href="/dashboard" style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                Dashboard
              </Link>
              <Link href="/admin" style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                Admin
              </Link>
            </>
          )}
          <WalletMultiButton />
        </div>
      </div>
    </nav>
  );
}
