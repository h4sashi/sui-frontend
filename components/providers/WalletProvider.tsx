'use client'

import { WalletProvider as SuietWalletProvider } from '@suiet/wallet-kit';
import '@suiet/wallet-kit/style.css';

interface WalletProviderProps {
  children: React.ReactNode;
}

export default function WalletProvider({ children }: WalletProviderProps) {
  return (
    <SuietWalletProvider>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {children as any}
    </SuietWalletProvider>
  );
}