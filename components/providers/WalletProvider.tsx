'use client'

import React, { Suspense } from 'react';
import { WalletProvider as SuietWalletProvider } from '@suiet/wallet-kit';
import '@suiet/wallet-kit/style.css';
import { useWalletConnect, WalletConnectData } from '../../hooks/useWalletConnect';
import { useSearchParams } from 'next/navigation';

interface WalletProviderProps {
  children: React.ReactNode;
}

function WalletConnection() {
  const searchParams = useSearchParams();
  const BACKEND_URL = 'https://rinoco.onrender.com/auth/wallet-connect';
  
  useWalletConnect(async (walletData: WalletConnectData) => {
    try {
      // Get state from URL query parameter
      const state = searchParams.get('state');
      
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
          state: state || window.crypto.randomUUID?.() || Math.random().toString(36).substring(2),
        }),
      });

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

  return null;
}

export default function WalletProvider({ children }: WalletProviderProps) {
  return (
    <SuietWalletProvider>
      <Suspense fallback={null}>
        <WalletConnection />
      </Suspense>
      {React.isValidElement(children) ? children : <>{children}</>}
    </SuietWalletProvider>
  );
}