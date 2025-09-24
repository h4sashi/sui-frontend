// TransactionDemo.tsx
'use client'

import { useWallet } from '@suiet/wallet-kit';
import { Transaction } from "@mysten/sui/transactions";

import { useState } from 'react';

export default function TransactionDemo() {
  const wallet = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  type TxResult = ReturnType<typeof wallet.signAndExecuteTransaction> extends Promise<infer R> ? R : never;
  const [txResult, setTxResult] = useState<TxResult | null>(null);

  const handleMoveCall = async () => {
    if (!wallet.connected) {
      alert('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setMessage('');
    setTxResult(null);

    try {
      const tx = new Transaction();
      
      // Example move call - you'll need to replace with actual package ID and function
      const packageObjectId = "0x1"; // Replace with actual package ID
      
      tx.moveCall({
        target: `${packageObjectId}::nft::mint`,
        arguments: [tx.pure.string("Example NFT")],
      });

      const result = await wallet.signAndExecuteTransaction({
        transaction: tx,
      });

      setTxResult(result);
      setMessage('Transaction executed successfully!');
    } catch (error) {
      console.error('Transaction failed:', error);
      setMessage(`Transaction failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignMessage = async () => {
    if (!wallet.connected) {
      alert('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const result = await wallet.signPersonalMessage({
        message: new TextEncoder().encode("Hello World from Sui DApp!"),
      });

      setMessage(`Message signed successfully! Signature: ${result.signature}`);
    } catch (error) {
      console.error('Message signing failed:', error);
      setMessage(`Message signing failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!wallet.connected) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-md p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Transaction Demo
      </h3>
      
      <div className="space-y-4">
        <div className="flex space-x-4">
          <button
            onClick={handleMoveCall}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 
                     text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {isLoading ? 'Processing...' : 'Execute Move Call'}
          </button>
          
          <button
            onClick={handleSignMessage}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 
                     text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {isLoading ? 'Signing...' : 'Sign Message'}
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-md ${
            message.includes('failed') 
              ? 'bg-red-50 text-red-700 border border-red-200' 
              : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            <p className="break-all">{message}</p>
          </div>
        )}

        {txResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 className="font-semibold text-blue-800 mb-2">Transaction Result:</h4>
            <pre className="text-sm text-blue-600 overflow-x-auto">
              {JSON.stringify(txResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}