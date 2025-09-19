
import { useWallet } from '@suiet/wallet-kit';
import { useEffect } from 'react';

export interface WalletConnectData {
  walletAddress: string;
  walletName: string;
}

/**
 * Hook to detect wallet connection and trigger a callback with wallet data.
 * @param onConnect Callback to run when wallet is connected.
 */
export function useWalletConnect(onConnect: (walletData: WalletConnectData) => void) {
  const { connected, account, name } = useWallet();

  useEffect(() => {
    if (connected && account?.address && name) {
      onConnect({
        walletAddress: account.address,
        walletName: name,
      });
    }
    // Only run when connection/account/name changes
  }, [connected, account, name, onConnect]);
}
