// WalletInfo.tsx
'use client'

import { useWallet } from '@suiet/wallet-kit';
import { useEffect, useState } from 'react';

export default function WalletInfo() {
  const wallet = useWallet();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div>Loading...</div>;
  }

  if (!wallet.connected) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <h3 className="text-lg font-medium text-yellow-800">
          Wallet Not Connected
        </h3>
        <p className="text-yellow-700">
          Please connect your wallet to interact with the dApp.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-green-50 border border-green-200 rounded-md p-4">
      <h3 className="text-lg font-medium text-green-800 mb-4">
        Wallet Connected
      </h3>
      <div className="space-y-2">
        <div>
          <span className="font-semibold text-green-700">Wallet Name: </span>
          <span className="text-green-600">{wallet.name}</span>
        </div>
        <div>
          <span className="font-semibold text-green-700">Address: </span>
          <span className="text-green-600 font-mono text-sm">
            {wallet.account?.address}
          </span>
        </div>
        <div>
          <span className="font-semibold text-green-700">Public Key: </span>
          <span className="text-green-600 font-mono text-sm break-all">
            {wallet.account?.publicKey}
          </span>
        </div>
      </div>
    </div>
  );
}