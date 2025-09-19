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
    console.log('Wallet connection triggered with data:', walletData);
    // Generate a unique state for this session (could use uuid)
    const state = window.crypto.randomUUID?.() || Math.random().toString(36).substring(2);

    try {
      console.log('Making request to:', BACKEND_URL);
      console.log('With payload:', { ...walletData, state });
      
      const res = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          ...walletData,
          state,
        }),
      });
      console.log('Response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Server error response:', errorText);
        throw new Error(`Server returned ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      console.log('Successful wallet connect response:', data);
    } catch (err) {
      console.error('Failed to connect wallet to backend:', err);
      console.error('Full error:', err);
    }
  });

  return (
    <SuietWalletProvider>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {children as any}
    </SuietWalletProvider>
  );
}