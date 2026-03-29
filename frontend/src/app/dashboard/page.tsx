'use client';

import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { ShieldAlert, ShieldCheck, ArrowUpRight, ArrowDownLeft, Clock, Activity, FileText } from 'lucide-react';
import { useVaultState, useWhitelist, useVaultEvents, useDeposit } from '../hooks/useVaultState';
import { useWalletPublicKey } from '../hooks/useWalletAdapter';

export default function Dashboard() {
  const { connected } = useWallet();
  const { publicKey: walletAddress } = useWalletPublicKey();
  const { vaultState, userBalance, accruedYield, isLoading: vaultLoading } = useVaultState();
  const { isWhitelisted, isLoading: whitelistLoading } = useWhitelist();
  const { events } = useVaultEvents(walletAddress || undefined);
  const { deposit, withdraw, isSubmitting } = useDeposit();
  
  const [depositAmount, setDepositAmount] = useState('');
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');

  const currentApy = vaultState ? vaultState.apy / 100 : 8.4;
  const vaultCap = vaultState ? vaultState.cap : 100000000;
  const currentVaultTotal = vaultState ? vaultState.totalDeposits : 45000000;
  const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    
    const result = await deposit(amount);
    if (result.success) {
      setDepositAmount('');
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;
    
    const result = await withdraw(amount);
    if (result.success) {
      setDepositAmount('');
    }
  };

  const isLoading = vaultLoading || whitelistLoading;

  if (!connected) {
    return (
      <div className="container flex-center" style={{ minHeight: '60vh', flexDirection: 'column', gap: '24px' }}>
        <ShieldAlert size={64} color="var(--text-muted)" />
        <h2>Connect Wallet to Access Vault</h2>
        <p className="text-sub" style={{ textAlign: 'center' }}>
          Please connect your whitelisted institutional wallet to view your position and deploy capital.
        </p>
        {isDemoMode && (
          <p style={{ color: 'var(--accent-gold)', fontSize: '0.875rem', marginTop: '8px' }}>
            Demo Mode: Connect any wallet to preview
          </p>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container flex-center" style={{ minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="glow-animation" style={{ width: '48px', height: '48px', borderRadius: '50%', border: '3px solid var(--accent-gold)', borderTopColor: 'transparent', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p className="text-sub">Loading vault state...</p>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
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
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Simulated vault data - {vaultState?.apy ? `${vaultState.apy / 100}%` : '8.4%'} APY</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Institutional Portfolio</h1>
          <p className="text-sub">Manage your stablecoin deposits and track Kamino yield in real-time.</p>
        </div>
        <div className="glass-panel" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          {isWhitelisted ? (
            <>
              <ShieldCheck size={28} color="#2ECC71" />
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>KYC Status</div>
                <div style={{ fontWeight: 600, color: '#2ECC71' }}>Verified (Tier 3)</div>
              </div>
            </>
          ) : (
            <>
              <ShieldAlert size={28} color="#E74C3C" />
              <div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>KYC Status</div>
                <div style={{ fontWeight: 600, color: '#E74C3C' }}>Not Whitelisted</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '48px' }}>
        <div className="glass-panel" style={{ padding: '32px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '12px' }}>Principal Deposited</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700 }}>
            ${(userBalance).toLocaleString()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', color: '#2ECC71', fontSize: '0.875rem' }}>
            <Activity size={16} /> Earning {currentApy.toFixed(1)}% APY
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '32px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '12px' }}>Accrued Yield</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-gold)' }}>
            +${(accruedYield).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            <Clock size={16} /> Since Oct 24, 2025
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '4px' }}>Vault Global Utilization</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>{(currentVaultTotal/vaultCap * 100).toFixed(1)}%</span>
            <span style={{ color: 'var(--text-muted)' }}>${(currentVaultTotal/1000000).toFixed(1)}M / $100M</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${(currentVaultTotal/vaultCap)*100}%`, height: '100%', background: 'var(--accent-blue)' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '32px' }}>
        <div className="glass-panel" style={{ padding: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h3 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <FileText size={20} color="var(--accent-gold)" /> On-Chain Audit Log
            </h3>
            <button className="btn-outline-gold" style={{ padding: '6px 16px', fontSize: '0.875rem' }}>Download CSV</button>
          </div>
          
          {events.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <th style={{ padding: '16px 0', fontWeight: 500 }}>Action</th>
                  <th style={{ padding: '16px 0', fontWeight: 500 }}>Amount (USDC)</th>
                  <th style={{ padding: '16px 0', fontWeight: 500 }}>Timestamp</th>
                  <th style={{ padding: '16px 0', fontWeight: 500 }}>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '20px 0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ background: event.action === 'deposit' ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)', padding: '8px', borderRadius: '50%' }}>
                        {event.action === 'deposit' ? (
                          <ArrowDownLeft size={16} color="#2ECC71" />
                        ) : (
                          <ArrowUpRight size={16} color="#E74C3C" />
                        )}
                      </div>
                      {event.action.charAt(0).toUpperCase() + event.action.slice(1)}
                    </td>
                    <td style={{ padding: '20px 0', fontWeight: 600 }}>{event.amount.toLocaleString()}.00</td>
                    <td style={{ padding: '20px 0', color: 'var(--text-muted)' }}>{new Date(event.timestamp * 1000).toLocaleDateString()}</td>
                    <td style={{ padding: '20px 0', color: 'var(--accent-blue)' }}>{event.txHash.slice(0, 8)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No transaction history yet
            </div>
          )}
        </div>

        <div className="glass-panel-gold" style={{ padding: '32px' }}>
          <h3 style={{ fontSize: '1.25rem', marginBottom: '24px' }}>Vault Actions</h3>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
            <button
              onClick={() => setActiveTab('deposit')}
              className={activeTab === 'deposit' ? 'btn-primary' : 'btn-secondary'}
              style={{ flex: 1, justifyContent: 'center', padding: '10px' }}
            >
              <ArrowDownLeft size={18} /> Deposit
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={activeTab === 'withdraw' ? 'btn-primary' : 'btn-secondary'}
              style={{ flex: 1, justifyContent: 'center', padding: '10px' }}
            >
              <ArrowUpRight size={18} /> Withdraw
            </button>
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '8px' }}>Amount (USDC)</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '16px',
                  color: 'white',
                  fontSize: '1.25rem',
                  fontFamily: 'var(--font-family)',
                  outline: 'none'
                }}
              />
              <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 600 }}>USDC</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Wallet Balance: 2,500,000 USDC
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {activeTab === 'deposit' ? (
              <button 
                className="btn-primary" 
                style={{ width: '100%', justifyContent: 'center' }} 
                disabled={!isWhitelisted || isSubmitting}
                onClick={handleDeposit}
              >
                {isSubmitting ? 'Processing...' : (<><ArrowDownLeft size={18} /> Deposit to Vault</>)}
              </button>
            ) : (
              <button 
                className="btn-secondary" 
                style={{ width: '100%', justifyContent: 'center' }}
                disabled={isSubmitting}
                onClick={handleWithdraw}
              >
                {isSubmitting ? 'Processing...' : (<><ArrowUpRight size={18} /> Withdraw</>)}
              </button>
            )}
          </div>

          {!isWhitelisted && (
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.2)', borderRadius: '8px', fontSize: '0.875rem', color: '#E74C3C', textAlign: 'center' }}>
              KYC verification required for deposits.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
