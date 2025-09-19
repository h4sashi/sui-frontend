'use client'


import { WalletProvider as SuietWalletProvider } from '@suiet/wallet-kit';
import '@suiet/wallet-kit/style.css';
import { useWalletConnect, WalletConnectData } from '../../hooks/useWalletConnect';

interface WalletProviderProps {
  children: React.ReactNode;
}

export default function WalletProvider({ children }: WalletProviderProps) {
  // Replace with your backend URL
  const BACKEND_URL = 'https://rinoco.onrender.com/auth/wallet-connect';

  useWalletConnect(async (walletData: WalletConnectData) => {
    // Generate a unique state for this session (could use uuid)
    const state = window.crypto.randomUUID?.() || Math.random().toString(36).substring(2);

    try {
      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...walletData,
          state,
        }),
      });
      const data = await res.json();
      // Optionally handle the response (e.g., show success, store session, etc.)
      console.log('Wallet connect response:', data);
    } catch (err) {
      console.error('Failed to connect wallet to backend:', err);
    }
  });

  return (
    <SuietWalletProvider>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {children as any}
    </SuietWalletProvider>
  );
}