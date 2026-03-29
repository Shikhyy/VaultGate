'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, TrendingUp, Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';

export default function LandingPage() {
  const { connected } = useWallet();

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Background Shapes */}
      <div
        style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, rgba(11,25,44,0) 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          zIndex: -1,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          left: '-10%',
          width: '800px',
          height: '800px',
          background: 'radial-gradient(circle, rgba(62,142,208,0.05) 0%, rgba(11,25,44,0) 70%)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          zIndex: -1,
        }}
      />

      <section style={{ padding: '120px 0', minHeight: '85vh', display: 'flex', alignItems: 'center' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '64px', alignItems: 'center' }}>
            
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '999px', border: '1px solid var(--border-gold)', marginBottom: '32px' }}>
                <ShieldCheck size={16} color="var(--accent-gold)" />
                <span style={{ color: 'var(--accent-gold)', fontSize: '0.875rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Institutional Grade Infrastructure
                </span>
              </div>
              
              <h1 className="heading-hero">
                Unlocking Yield, <br />
                <span>Secured by KYC.</span>
              </h1>
              
              <p className="text-sub" style={{ marginBottom: '48px' }}>
                VaultGate is a permissioned DeFi vault enabling regulated financial institutions 
                to deploy liquidity into Solana yield sources while automatically enforcing 
                MiCA and FINMA compliance on-chain.
              </p>
              
              <div style={{ display: 'flex', gap: '24px' }}>
                <Link href={connected ? "/dashboard" : "#"} className="btn-primary">
                  {connected ? "Go to Dashboard" : "Connect Institutional Wallet"} 
                  <ArrowRight size={20} />
                </Link>
                <Link href="/docs" className="btn-secondary">
                  Read Documentation
                </Link>
              </div>
            </motion.div>

            {/* Right Abstract Visual */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              style={{ position: 'relative', height: '500px' }}
            >
              {/* Premium Glass Card 1 */}
              <motion.div
                animate={{ y: [-10, 10, -10] }}
                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                className="glass-panel"
                style={{ position: 'absolute', top: '20px', right: '40px', width: '320px', padding: '32px', zIndex: 2 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Current Yield</span>
                  <div className="badge badge-verified">Active</div>
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  8.4% <TrendingUp size={28} color="#2ECC71" />
                </div>
                <div style={{ marginTop: '24px', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: '75%', height: '100%', background: 'linear-gradient(90deg, var(--accent-gold), var(--accent-gold-light))' }} />
                </div>
              </motion.div>

              {/* Premium Glass Card 2 - Golden Accent */}
              <motion.div
                animate={{ y: [10, -10, 10] }}
                transition={{ repeat: Infinity, duration: 8, ease: "easeInOut", delay: 1 }}
                className="glass-panel-gold glow-animation"
                style={{ position: 'absolute', bottom: '40px', left: '20px', width: '280px', padding: '24px', zIndex: 3 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Lock size={24} color="var(--accent-gold)" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>On-Chain KYC</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Transfer Hook enforced</p>
                  </div>
                </div>
              </motion.div>

              {/* Central Glowing Ring */}
              <div 
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '300px',
                  height: '300px',
                  borderRadius: '50%',
                  border: '1px solid rgba(212,175,55,0.2)',
                  boxShadow: 'inset 0 0 40px rgba(212,175,55,0.05)',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <div style={{ width: '200px', height: '200px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)' }} />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Feature Section */}
      <section style={{ padding: '80px 0', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--border-glass)' }}>
        <div className="container flex-center">
          <div style={{ display: 'flex', gap: '64px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>$100M+</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vault Capacity</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border-glass)' }} />
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-gold)', marginBottom: '8px' }}>&lt;30s</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>KYC Sync Latency</div>
            </div>
            <div style={{ width: '1px', background: 'var(--border-glass)' }} />
            <div>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>Token22</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Native Standard</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
