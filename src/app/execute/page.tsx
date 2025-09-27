'use client'

import { useSearchParams } from 'next/navigation';
import { useWallet, ConnectModal } from '@suiet/wallet-kit';
import { useState, useEffect, Suspense } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

// Initialize Sui client for devnet
const suiClient = new SuiClient({ url: getFullnodeUrl('devnet') });

interface BlockchainTransactionStatus {
  exists: boolean;
  success: boolean;
  digest: string;
  timestamp?: string;
  gasUsed?: string;
  error?: string;
  effects?: SuiTransactionEffects;
  events?: unknown[];
}

// Updated interface to match actual Sui wallet response
interface SuiTransactionEffects {
    status: {
        status: 'success' | 'failure';
        error?: string;
    } | string;
    gasUsed?: {
        computationCost: string;
        storageCost: string;
        storageRebate: string;
    };
    [key: string]: unknown;
}

interface TransactionResult {
    digest: string;
    effects?: SuiTransactionEffects;
    events?: unknown[];
    objectChanges?: Array<{
        type: string;
        objectType?: string;
        objectId?: string;
        [key: string]: unknown;
    }>;
    blockchainVerified?: boolean;
    gasUsed?: string;
    timestamp?: string;
    [key: string]: unknown;
}

// Method 1: Direct RPC query to verify transaction
async function verifyTransactionOnBlockchain(txDigest: string): Promise<BlockchainTransactionStatus> {
  try {
    console.log('Querying blockchain for transaction:', txDigest);
    
    // Get transaction details directly from blockchain
    const txResponse = await suiClient.getTransactionBlock({
      digest: txDigest,
      options: {
        showEffects: true,
        showEvents: true,
        showInput: true,
        showRawInput: false,
        showObjectChanges: true,
      }
    });

    console.log('Blockchain response:', txResponse);

    // Check if transaction exists and was successful
    const success = txResponse.effects?.status?.status === 'success';
    
    return {
      exists: true,
      success,
      digest: txResponse.digest,
      timestamp: txResponse.timestampMs ? new Date(parseInt(txResponse.timestampMs)).toISOString() : undefined,
      gasUsed: txResponse.effects?.gasUsed ? JSON.stringify(txResponse.effects.gasUsed) : undefined,
      effects: txResponse.effects as SuiTransactionEffects,
      events: txResponse.events || [],
      error: success ? undefined : txResponse.effects?.status?.error || 'Transaction failed on blockchain'
    };

  } catch (error) {
    console.error('Blockchain verification error:', error);
    
    // Check if it's a "transaction not found" error vs network error
    if (error instanceof Error && error.message.includes('not found')) {
      return {
        exists: false,
        success: false,
        digest: txDigest,
        error: 'Transaction not found on blockchain'
      };
    }
    
    return {
      exists: false,
      success: false,
      digest: txDigest,
      error: `Blockchain query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// Method 2: Wait and retry verification (for newly submitted transactions)
async function waitForTransactionConfirmation(
  txDigest: string, 
  maxRetries: number = 10, 
  retryDelay: number = 2000
): Promise<BlockchainTransactionStatus> {
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Verification attempt ${attempt}/${maxRetries} for ${txDigest}`);
    
    const result = await verifyTransactionOnBlockchain(txDigest);
    
    if (result.exists) {
      return result; // Transaction found, return status
    }
    
    if (attempt < maxRetries) {
      console.log(`Transaction not yet confirmed, waiting ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay *= 1.2; // Exponential backoff
    }
  }
  
  return {
    exists: false,
    success: false,
    digest: txDigest,
    error: 'Transaction not confirmed after maximum retries'
  };
}

function ExecutePageContent() {
    const searchParams = useSearchParams();
    const wallet = useWallet();
    const [transactionData, setTransactionData] = useState<string | null>(null);
    const [status, setStatus] = useState('Loading transaction data...');
    const [isExecuting, setIsExecuting] = useState(false);
    const [result, setResult] = useState<TransactionResult | null>(null);
    const [showConnectModal, setShowConnectModal] = useState(false);
    const [verificationStatus, setVerificationStatus] = useState<string>('');

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

            // Execute transaction - wallet response has limited info
            const walletResult = await wallet.signAndExecuteTransaction({
                transaction: tx
            });

            // Create result object with only the properties we know exist
            const result: TransactionResult = {
                digest: walletResult.digest,
                // Don't include effects here since it's base64 encoded string in wallet response
                // We'll get proper effects from blockchain verification instead
                events: [],
                objectChanges: []
            };

            console.log('Raw transaction result:', JSON.stringify(result, null, 2));
            
            // Since wallet doesn't provide structured effects, we'll rely on blockchain verification
            setResult(result);

            // Always use blockchain verification for reliable status checking
            setStatus(`Transaction submitted! Hash: ${result.digest.substring(0, 8)}... Verifying on blockchain...`);
            
            // Send transaction hash to Unity immediately
            if (window.opener) {
                console.log('Sending transaction hash back to Unity...');
                window.opener.postMessage({ 
                    type: 'TRANSACTION_SUBMITTED', 
                    transactionHash: result.digest,
                    walletAddress: wallet.account?.address,
                    timestamp: new Date().toISOString()
                }, '*');
            }

            // Verify on blockchain (this is the reliable part)
            const blockchainStatus = await waitForTransactionConfirmation(result.digest);
            
            if (blockchainStatus.exists && blockchainStatus.success) {
                setStatus(`Transaction confirmed on blockchain! Gas used: ${blockchainStatus.gasUsed || 'Unknown'}`);
                
                // Update result with blockchain data
                const updatedResult: TransactionResult = {
                    ...result,
                    effects: blockchainStatus.effects,
                    blockchainVerified: true,
                    gasUsed: blockchainStatus.gasUsed,
                    timestamp: blockchainStatus.timestamp
                };
                setResult(updatedResult);

                if (window.opener) {
                    window.opener.postMessage({ 
                        type: 'TRANSACTION_SUCCESS', 
                        transactionHash: result.digest,
                        walletAddress: wallet.account?.address,
                        result: updatedResult,
                        blockchainVerified: true,
                        timestamp: new Date().toISOString()
                    }, '*');
                }

                // Auto-verify transaction via API call
                if (wallet.account?.address) {
                    setVerificationStatus('Verifying transaction on server...');
                    try {
                        console.log('Auto-verifying transaction:', result.digest);
                        
                        const verifyResponse = await fetch('https://rinoco.onrender.com/verify-transaction', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Accept': 'application/json'
                            },
                            body: JSON.stringify({
                                transactionHash: result.digest,
                                walletAddress: wallet.account.address,
                                blockchainVerified: true
                            }),
                            signal: AbortSignal.timeout(60000)
                        });

                        if (!verifyResponse.ok) {
                            throw new Error(`Server responded with ${verifyResponse.status}: ${verifyResponse.statusText}`);
                        }

                        const verifyData = await verifyResponse.json();
                        console.log('Verification response:', verifyData);

                        if (verifyData.success && verifyData.verified) {
                            setVerificationStatus(`Binder verified! ID: ${verifyData.binderId?.substring(0, 8)}...`);
                            
                            if (window.opener) {
                                window.opener.postMessage({ 
                                    type: 'VERIFICATION_SUCCESS', 
                                    transactionHash: result.digest,
                                    binderId: verifyData.binderId,
                                    verified: true,
                                    message: verifyData.message
                                }, '*');
                            }
                        } else {
                            setVerificationStatus(`Verification pending: ${verifyData.message || 'Please check manually'}`);
                            
                            if (window.opener) {
                                window.opener.postMessage({ 
                                    type: 'VERIFICATION_PENDING', 
                                    transactionHash: result.digest,
                                    verified: false,
                                    message: verifyData.message
                                }, '*');
                            }
                        }
                    } catch (verifyError) {
                        console.error('Auto-verification failed:', verifyError);
                        setVerificationStatus('Auto-verification failed - but transaction was successful');
                        
                        if (window.opener) {
                            window.opener.postMessage({ 
                                type: 'VERIFICATION_FAILED', 
                                transactionHash: result.digest,
                                error: verifyError instanceof Error ? verifyError.message : 'Unknown verification error'
                            }, '*');
                        }
                    }
                }
                
                setTimeout(() => {
                    setStatus(`Transaction completed successfully! You can close this window.`);
                }, 3000);

            } else if (blockchainStatus.exists && !blockchainStatus.success) {
                // Transaction failed on blockchain
                setStatus(`Transaction failed on blockchain: ${blockchainStatus.error}`);
                console.error('Transaction failed:', blockchainStatus);
                
                if (window.opener) {
                    window.opener.postMessage({ 
                        type: 'TRANSACTION_FAILED',
                        error: blockchainStatus.error,
                        transactionHash: result.digest,
                        blockchainVerified: true
                    }, '*');
                }
            } else {
                // Transaction not found on blockchain
                setStatus(`Transaction not confirmed on blockchain after retries`);
                
                if (window.opener) {
                    window.opener.postMessage({ 
                        type: 'TRANSACTION_NOT_FOUND',
                        transactionHash: result.digest,
                        error: 'Transaction not found on blockchain'
                    }, '*');
                }
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
            
            setStatus(`Execution failed: ${errorMessage}`);
            
            if (window.opener) {
                window.opener.postMessage({ 
                    type: 'TRANSACTION_ERROR', 
                    error: errorMessage
                }, '*');
            }
        } finally {
            setIsExecuting(false);
        }
    };

    const handleClose = () => {
        if (window.opener) {
            // Send close message back to Unity
            window.opener.postMessage({
                type: 'WINDOW_CLOSING',
                result: result,
                finalStatus: status
            }, '*');
        }
        window.close();
    };

    // Manual verification button for fallback
    const handleManualVerification = async () => {
        if (!result?.digest || !wallet.account?.address) {
            setVerificationStatus('No transaction to verify');
            return;
        }

        setVerificationStatus('Manually verifying transaction...');

        try {
            const verifyResponse = await fetch('https://rinoco.onrender.com/verify-transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionHash: result.digest,
                    walletAddress: wallet.account.address,
                    blockchainVerified: true
                })
            });

            const verifyData = await verifyResponse.json();
            console.log('Manual verification response:', verifyData);

            if (verifyData.success && verifyData.verified) {
                setVerificationStatus(`Manual verification successful! Binder ID: ${verifyData.binderId?.substring(0, 8)}...`);

                // Send manual verification success back to Unity
                if (window.opener) {
                    window.opener.postMessage({
                        type: 'MANUAL_VERIFICATION_SUCCESS',
                        transactionHash: result.digest,
                        binderId: verifyData.binderId,
                        verified: true
                    }, '*');
                }
            } else {
                setVerificationStatus(`Manual verification failed: ${verifyData.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Manual verification error:', error);
            setVerificationStatus('Manual verification failed');
        }
    };

    const getStatusStyle = () => {
        if (status.includes('confirmed') || status.includes('successful') || status.includes('loaded')) {
            return 'bg-green-50 text-green-700 border-green-200';
        } else if (status.includes('failed') || status.includes('Error') || status.includes('error')) {
            return 'bg-red-50 text-red-700 border-red-200';
        } else if (status.includes('Executing') || status.includes('Preparing') || status.includes('Verifying')) {
            return 'bg-yellow-50 text-yellow-700 border-yellow-200';
        } else {
            return 'bg-blue-50 text-blue-700 border-blue-200';
        }
    };

    // Helper function to safely access status for display from blockchain data
    const getDisplayStatus = (result: TransactionResult) => {
        if (!result.effects?.status) return 'Pending Blockchain Verification';
        
        if (typeof result.effects.status === 'string') {
            return result.effects.status.toUpperCase();
        }
        
        if (typeof result.effects.status === 'object') {
            const statusObj = result.effects.status as Record<string, unknown>;
            if (statusObj.status) {
                return (statusObj.status as string).toUpperCase();
            }
            if ('Success' in statusObj) return 'SUCCESS';
            if ('Failure' in statusObj) return 'FAILURE';
        }
        
        return 'Unknown';
    };

    const isStatusSuccess = (result: TransactionResult) => {
        if (!result.effects?.status) return false;
        
        if (typeof result.effects.status === 'string') {
            return result.effects.status.toLowerCase() === 'success';
        }
        
        if (typeof result.effects.status === 'object') {
            const statusObj = result.effects.status as Record<string, unknown>;
            if (statusObj.status) {
                return (statusObj.status as string).toLowerCase() === 'success';
            }
            return 'Success' in statusObj;
        }
        
        return false;
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white shadow-lg rounded-lg p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-2xl font-bold text-gray-900">
                            Execute Sui Transaction (Devnet)
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

                    {/* Verification Status Display */}
                    {verificationStatus && (
                        <div className="mb-6">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-blue-900 mb-1">Verification Status</h3>
                                <p className="text-blue-800 text-sm">{verificationStatus}</p>
                            </div>
                        </div>
                    )}

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
                                        <span className="text-gray-500">Network:</span>
                                        <span className="ml-2">Sui Devnet</span>
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

                        {/* Manual verification button */}
                        {result && result.blockchainVerified && (
                            <button
                                onClick={handleManualVerification}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                            >
                                Verify Manually
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

                                {result.blockchainVerified && (
                                    <div className="mb-3">
                                        <span className="text-sm text-gray-500">Blockchain Status:</span>
                                        <p className={`font-medium mt-1 ${isStatusSuccess(result)
                                            ? 'text-green-600'
                                            : 'text-red-600'
                                            }`}>
                                            {getDisplayStatus(result)}
                                        </p>
                                        {result.gasUsed && (
                                            <p className="text-gray-600 text-sm mt-1">Gas: {result.gasUsed}</p>
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
                        <p>This window executes Sui blockchain transactions on <strong>Devnet</strong> using your connected wallet.</p>
                        <p className="mt-1">Make sure you have sufficient SUI tokens for gas fees on devnet.</p>
                        <p className="mt-2 text-blue-600">Transaction results are verified directly on the blockchain for maximum reliability.</p>
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