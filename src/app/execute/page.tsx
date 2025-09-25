'use client'

import { useSearchParams } from 'next/navigation';
import { useWallet, ConnectModal } from '@suiet/wallet-kit';
import { useState, useEffect, Suspense } from 'react';
import { Transaction } from '@mysten/sui/transactions';

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

function ExecutePageContent() {
  const searchParams = useSearchParams();
  const wallet = useWallet();
  const [transactionData, setTransactionData] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading transaction data...');
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);

  useEffect(() => {
    const txParam = searchParams.get('tx');
    if (txParam) {
      try {
        const decoded = decodeURIComponent(txParam);
        setTransactionData(decoded);
        setStatus('Transaction loaded. Connect wallet to execute.');
        console.log('Transaction data loaded, length:', decoded.length);
      } catch (e) {
        console.error('Error decoding transaction:', e);
        setStatus('Error: Invalid transaction data format');
      }
    } else {
      setStatus('Error: No transaction data provided in URL');
    }
  }, [searchParams]);

  const handleExecute = async () => {
    if (!wallet.connected) {
      setStatus('Please connect your wallet first');
      setShowConnectModal(true);
      return;
    }

    if (!transactionData) {
      setStatus('No transaction data available');
      return;
    }

    try {
      setIsExecuting(true);
      setStatus('Preparing transaction for execution...');

      let tx: Transaction;
      
      try {
        console.log('Deserializing transaction data...');
        tx = Transaction.from(transactionData);
        console.log('Transaction deserialized successfully');
        
      } catch (deserializationError) {
        console.error('Transaction deserialization error:', deserializationError);
        throw new Error(`Failed to deserialize transaction: ${deserializationError instanceof Error ? deserializationError.message : 'Unknown deserialization error'}`);
      }

      setStatus('Executing transaction in wallet...');

      const result = await wallet.signAndExecuteTransaction({
        transaction: tx
      }) as TransactionResult;

      console.log('Transaction executed:', result);
      setResult(result);

      if (result.effects?.status?.status === 'success') {
        setStatus(`✅ Transaction successful! Digest: ${result.digest}`);
        
        setTimeout(() => {
          setStatus(`Transaction completed successfully! You can close this window.`);
        }, 3000);
      } else {
        const errorMessage = result.effects?.status?.error || 'Unknown transaction error';
        setStatus(`❌ Transaction failed: ${errorMessage}`);
        console.error('Transaction execution failed:', result);
      }

    } catch (error: unknown) {
      console.error('Transaction execution error:', error);
      
      let errorMessage = 'Unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        if (errorMessage.includes('User rejected')) {
          errorMessage = 'Transaction was cancelled by user';
        } else if (errorMessage.includes('Insufficient')) {
          errorMessage = 'Insufficient balance for transaction';
        } else if (errorMessage.includes('Invalid transaction')) {
          errorMessage = 'Transaction format is invalid';
        }
      }
      
      setStatus(`❌ Execution failed: ${errorMessage}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleClose = () => {
    if (window.opener) {
      window.opener.postMessage({ type: 'TRANSACTION_COMPLETE', result }, '*');
    }
    window.close();
  };

  const getStatusStyle = () => {
    if (status.includes('✅') || status.includes('successful') || status.includes('loaded')) {
      return 'bg-green-50 text-green-700 border-green-200';
    } else if (status.includes('❌') || status.includes('Error') || status.includes('failed')) {
      return 'bg-red-50 text-red-700 border-red-200';
    } else if (status.includes('Executing') || status.includes('Preparing')) {
      return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    } else {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Execute Sui Transaction
            </h1>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              title="Close window"
            >
              ×
            </button>
          </div>

          <div className={`p-4 rounded-md border mb-6 ${getStatusStyle()}`}>
            <div className="flex items-center">
              {isExecuting && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-3"></div>
              )}
              <p className="font-medium">{status}</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Wallet Status</h2>
            {wallet.connected ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <div className="w-3 h-3 bg-green-400 rounded-full mr-3"></div>
                  <p className="text-green-700 font-medium">
                    Connected: {wallet.name}
                  </p>
                </div>
                <p className="text-green-600 text-sm font-mono break-all">
                  {wallet.account?.address}
                </p>
              </div>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-yellow-400 rounded-full mr-3"></div>
                  <p className="text-yellow-700">Wallet not connected</p>
                </div>
              </div>
            )}
          </div>

          {transactionData && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Transaction Summary</h2>
              <div className="bg-gray-50 border rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Data Size:</span>
                    <span className="ml-2 font-mono">{transactionData.length} bytes</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Type:</span>
                    <span className="ml-2">Sui Transaction</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex space-x-4 mb-6">
            {!wallet.connected && (
              <button
                onClick={() => setShowConnectModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
              >
                Connect Wallet
              </button>
            )}
            
            {wallet.connected && transactionData && (
              <button
                onClick={handleExecute}
                disabled={isExecuting}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3 px-6 rounded-lg transition-colors flex items-center"
              >
                {isExecuting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                )}
                {isExecuting ? 'Executing Transaction...' : 'Execute Transaction'}
              </button>
            )}

            <button
              onClick={handleClose}
              className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
              Close Window
            </button>
          </div>

          {result && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Transaction Result</h2>
              <div className="bg-gray-50 border rounded-lg p-4">
                <div className="mb-3">
                  <span className="text-sm text-gray-500">Transaction Digest:</span>
                  <p className="font-mono text-sm break-all mt-1">{result.digest}</p>
                </div>
                
                {result.effects?.status && (
                  <div className="mb-3">
                    <span className="text-sm text-gray-500">Status:</span>
                    <p className={`font-medium mt-1 ${
                      result.effects.status.status === 'success' 
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }`}>
                      {result.effects.status.status.toUpperCase()}
                    </p>
                    {result.effects.status.error && (
                      <p className="text-red-600 text-sm mt-1">{result.effects.status.error}</p>
                    )}
                  </div>
                )}

                <details className="mt-3">
                  <summary className="text-sm text-gray-500 cursor-pointer">
                    View Full Result
                  </summary>
                  <pre className="text-xs text-gray-600 mt-2 overflow-x-auto">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          )}

          <div className="text-sm text-gray-500">
            <p>This window will execute a Sui blockchain transaction using your connected wallet.</p>
            <p className="mt-1">Make sure you have sufficient SUI tokens for gas fees.</p>
          </div>

          <ConnectModal
            open={showConnectModal}
            onOpenChange={(open) => setShowConnectModal(open)}
          />
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/3 mb-6"></div>
            <div className="h-4 bg-gray-300 rounded w-full mb-4"></div>
            <div className="h-4 bg-gray-300 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExecutePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ExecutePageContent />
    </Suspense>
  );
}

// git add . && git commit -m "Added /Execute" && git push origin main