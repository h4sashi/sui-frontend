//useWalletConnect.ts

import { useWallet } from '@suiet/wallet-kit';
import { useEffect } from 'react';

export interface WalletConnectData {
  walletAddress: string;
  walletName: string;
}

export function useWalletConnect(onConnect: (walletData: WalletConnectData) => void) {
  const wallet = useWallet();

  useEffect(() => {
    // Debug log
    console.log('Wallet state:', wallet);

    if (wallet.connected && wallet.account?.address && wallet.name) {
      onConnect({
        walletAddress: wallet.account.address,
        walletName: wallet.name,
      });
    }
  }, [wallet.connected, wallet.account, wallet.name, onConnect]);
}
