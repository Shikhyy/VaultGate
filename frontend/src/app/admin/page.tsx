'use client';

import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ShieldAlert, Users, Layers, PauseCircle, PlayCircle, Settings2 } from 'lucide-react';
import { useVaultState } from '../hooks/useVaultState';
import { MOCK_WHITELIST, WhitelistEntry } from '../lib/idl';

export default function AdminDashboard() {
  const { connected } = useWallet();
  const { vaultState } = useVaultState();
  
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const isVaultPaused = vaultState?.isPaused ?? false;
  const totalAUM = vaultState?.totalDeposits ?? 45000000;
  const vaultCap = vaultState?.cap ?? 100000000;
  const activeDepositors = 14;
  const yieldDistributed30d = vaultState?.totalYieldAccrued 
    ? vaultState.totalYieldAccrued / 100 
    : 315000;

  const depositors: WhitelistEntry[] = isDemoMode ? MOCK_WHITELIST : [];

  if (!connected && !isDemoMode) {
    return (
      <div className="container flex-center" style={{ minHeight: '60vh', flexDirection: 'column', gap: '24px' }}>
        <ShieldAlert size={64} color="var(--text-muted)" />
        <h2>Connect Multi-Sig Wallet</h2>
        <p className="text-sub" style={{ textAlign: 'center' }}>
          Admin access requires connection from the authorized AMINA Bank treasury multi-sig.
        </p>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '64px 24px' }}>
      {isDemoMode && (
        <div style={{ 
          background: 'rgba(212, 175, 55, 0.1)', 
          border: '1px solid var(--accent-gold)', 
          borderRadius: '8px', 
          padding: '12px 16px', 
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ color: 'var(--accent-gold)', fontWeight: 600, fontSize: '0.875rem' }}>DEMO MODE</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Preview only - Admin actions simulated</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Vault Configuration</h1>
          <p className="text-sub">AMINA Bank Treasury Administration Panel.</p>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings2 size={18} /> Update Oracle Auth
          </button>
          <button className={isVaultPaused ? "btn-primary" : "btn-secondary"} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderColor: isVaultPaused ? 'transparent' : '#E74C3C', color: isVaultPaused ? 'var(--text-dark)' : '#E74C3C' }}>
            {isVaultPaused ? <PlayCircle size={18} /> : <PauseCircle size={18} />}
            {isVaultPaused ? "Resume Deposits" : "Pause Deposits"}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '48px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            <Layers size={20} /> Total AUM
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>${(totalAUM / 1000000).toFixed(1)}M</div>
          <div style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cap: ${(vaultCap / 1000000).toFixed(1)}M</div>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            <Users size={20} /> Depositors
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{activeDepositors}</div>
          <div style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Verified Institutions</div>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            <Layers size={20} /> 30d Yield Distributed
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2ECC71' }}>${(yieldDistributed30d / 1000).toFixed(1)}K</div>
          <div style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Kamino Routing</div>
        </div>
        
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            <ShieldAlert size={20} /> Status
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: isVaultPaused ? '#E74C3C' : '#2ECC71' }}>
            {isVaultPaused ? "Paused" : "Active"}
          </div>
          <div style={{ marginTop: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {isVaultPaused ? "Withdrawals only" : "Accepting Deposits"}
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '32px' }}>
        <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Depositor Roster</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>List of currently active and whitelisted liquidity providers.</p>
        
        {depositors.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                <th style={{ padding: '16px 0', fontWeight: 500 }}>Wallet Address</th>
                <th style={{ padding: '16px 0', fontWeight: 500 }}>Jurisdiction</th>
                <th style={{ padding: '16px 0', fontWeight: 500 }}>Deposit Amount</th>
                <th style={{ padding: '16px 0', fontWeight: 500 }}>KYC Status</th>
              </tr>
            </thead>
            <tbody>
              {depositors.map((depositor, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '20px 0', fontFamily: 'monospace' }}>
                    {depositor.wallet.slice(0, 8)}...{depositor.wallet.slice(-4)}
                  </td>
                  <td style={{ padding: '20px 0' }}>
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid var(--border-glass)' }}>
                      {depositor.jurisdiction} (Tier {depositor.tier})
                    </span>
                  </td>
                  <td style={{ padding: '20px 0', fontWeight: 600 }}>1,250,000 USDC</td>
                  <td style={{ padding: '20px 0' }}>
                    <span className="badge badge-verified">
                      {depositor.isActive ? 'Verified' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Connect wallet to view depositor roster
          </div>
        )}
      </div>
    </div>
  );
}
