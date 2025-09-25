'use client'

import { useSearchParams } from 'next/navigation';
import { useWallet, ConnectModal } from '@suiet/wallet-kit';
import { useState, useEffect, Suspense } from 'react';
import { Transaction } from '@mysten/sui/transactions';

// Define proper TypeScript interfaces
interface SerializedTransactionData {
  [key: string]: unknown;
}

interface TransactionResult {
  digest: string;
  effects?: {
    status?: {
      status: 'success' | 'failure';
      error?: string;
    };
  };
  events?: unknown[];
  objectChanges?: unknown[];
}

// Component that uses useSearchParams
function ExecutePageContent() {
  const searchParams = useSearchParams();
  const wallet = useWallet();
  const [transactionData, setTransactionData] = useState<SerializedTransactionData | null>(null);
  const [status, setStatus] = useState('Loading transaction data...');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  useEffect(() => {
    const txParam = searchParams.get('tx');
    if (txParam) {
      try {
        const decoded = decodeURIComponent(txParam);
        const parsed = JSON.parse(decoded) as SerializedTransactionData;
        setTransactionData(parsed);
        setStatus('Transaction loaded. Connect wallet to execute.');
      } catch (e) {
        console.error('Error parsing transaction:', e);
        setStatus('Error: Invalid transaction data');
      }
    } else {
      setStatus('Error: No transaction data provided');
    }
  }, [searchParams]);

  const handleExecute = async () => {
    if (!wallet.connected) {
      setStatus('Please connect your wallet first');
      return;
    }

    if (!transactionData) {
      setStatus('No transaction data available');
      return;
    }

    try {
      setIsExecuting(true);
      setStatus('Executing transaction...');

      // Create Transaction object from the serialized data
      let tx: Transaction;
      
      try {
        // Try different approaches based on the data structure
        if (typeof transactionData === 'string') {
          // If it's a serialized string
          tx = Transaction.from(transactionData);
        } else if (transactionData instanceof Uint8Array) {
          // If it's serialized bytes
          tx = Transaction.from(transactionData);
        } else if (transactionData && typeof transactionData === 'object') {
          // Check for common serialization fields
          if ('serialized' in transactionData && typeof transactionData.serialized === 'string') {
            tx = Transaction.from(transactionData.serialized);
          } else if ('bytes' in transactionData && transactionData.bytes instanceof Uint8Array) {
            tx = Transaction.from(transactionData.bytes);
          } else if ('data' in transactionData && typeof transactionData.data === 'string') {
            tx = Transaction.from(transactionData.data);
          } else {
            // If it's a plain object, try to serialize it as JSON and then create transaction
            // This is a fallback - you might need to adjust based on your actual data format
            const serialized = JSON.stringify(transactionData);
            tx = Transaction.from(serialized);
          }
        } else {
          throw new Error('Unsupported transaction data format.');
        }
      } catch (deserializationError) {
        console.error('Transaction deserialization error:', deserializationError);
        throw new Error(`Failed to deserialize transaction: ${deserializationError instanceof Error ? deserializationError.message : 'Unknown error'}`);
      }

      // Execute the transaction
      const result = await wallet.signAndExecuteTransaction({
        transaction: tx,
      }) as TransactionResult;

      setResult(result);

      if (result.effects?.status?.status === 'success') {
        setStatus(`Transaction successful! Digest: ${result.digest}`);
        
        // Auto-close after 3 seconds
        setTimeout(() => {
          window.close();
        }, 3000);
      } else {
        setStatus(`Transaction failed: ${result.effects?.status?.error || 'Unknown error'}`);
      }

    } catch (error: unknown) {
      console.error('Transaction execution error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setStatus(`Execution failed: ${errorMessage}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const getStatusStyle = () => {
    if (status.includes('successful') || status.includes('loaded')) {
      return 'bg-green-50 text-green-700 border-green-200';
    } else if (status.includes('Error') || status.includes('failed')) {
      return 'bg-red-50 text-red-700 border-red-200';
    } else {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            Execute Sui Transaction
          </h1>

          {/* Status */}
          <div className={`p-4 rounded-md border mb-6 ${getStatusStyle()}`}>
            <p className="font-medium">{status}</p>
          </div>

          {/* Wallet Connection Status */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Wallet Status</h2>
            {wallet.connected ? (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <p className="text-green-700">
                  <strong>Connected:</strong> {wallet.name}
                </p>
                <p className="text-green-600 text-sm font-mono">
                  {wallet.account?.address}
                </p>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-yellow-700">Wallet not connected</p>
              </div>
            )}
          </div>

          {/* Transaction Details */}
          {transactionData && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Transaction Details</h2>
              <div className="bg-gray-50 border rounded p-3 max-h-60 overflow-y-auto">
                <pre className="text-xs text-gray-600">
                  {JSON.stringify(transactionData, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-4 mb-6">
            {!wallet.connected && (
              <button
                onClick={() => setShowConnectModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Connect Wallet
              </button>
            )}
            
            {wallet.connected && transactionData && (
              <button
                onClick={handleExecute}
                disabled={isExecuting}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded"
              >
                {isExecuting ? 'Executing...' : 'Execute Transaction'}
              </button>
            )}

            <button
              onClick={() => window.close()}
              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
            >
              Cancel
            </button>
          </div>

          {/* Transaction Result */}
          {result && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Transaction Result</h2>
              <div className="bg-gray-50 border rounded p-3 max-h-60 overflow-y-auto">
                <pre className="text-xs text-gray-600">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Connect Modal */}
          <ConnectModal
            open={showConnectModal}
            onOpenChange={(open) => setShowConnectModal(open)}
          />
        </div>
      </div>
    </div>
  );
}

// Main component with Suspense wrapper
export default function ExecutePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-center h-32">
              <div className="text-lg text-gray-600">Loading...</div>
            </div>
          </div>
        </div>
      </div>
    }>
      <ExecutePageContent />
    </Suspense>
  );
}