import type { Metadata } from 'next';
import './globals.css';
import { WalletContextProvider } from '@/components/WalletContextProvider';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'VaultGate | Institutional Yield',
  description: 'KYC-gated institutional yield vault on Solana.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <WalletContextProvider>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <Navbar />
            <main style={{ flex: 1 }}>{children}</main>
            <footer style={{ padding: '48px 0', borderTop: '1px solid var(--border-glass)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="container">
                <p>&copy; {new Date().getFullYear()} VaultGate - Institutional DeFi Protocol. All rights reserved.</p>
              </div>
            </footer>
          </div>
        </WalletContextProvider>
      </body>
    </html>
  );
}
