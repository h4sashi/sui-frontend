// components/TransactionSigning.tsx
'use client'
import { useWallet } from '@suiet/wallet-kit';
import { useState, useEffect, useCallback } from 'react';

interface TransactionSigningProps {
    signingId?: string; // From URL params
    onComplete?: () => void;
}

interface SigningRequest {
    walletAddress: string;
    operationType: string;
    description: string;
    txBytes: number[];
    timestamp: number;
}

interface SignedTransaction {
    signature?: string;
    txSignature?: string;
    signatures?: string[];
    publicKey?: string;
    pubKey?: string;
    public_key?: string;
}

export default function TransactionSigning({ signingId, onComplete }: TransactionSigningProps) {
    const wallet = useWallet();
    const [signingRequest, setSigningRequest] = useState<SigningRequest | null>(null);
    const [status, setStatus] = useState<string>('loading');
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);

    // Load signing request when component mounts
    const loadSigningRequest = useCallback(async () => {
        try {
            setStatus('loading');

            const response = await fetch(`https://rinoco.onrender.com/signing-request/${signingId}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load signing request');
            }

            setSigningRequest(data);
            setStatus('ready');

            // Verify wallet matches
            if (wallet.connected && wallet.account?.address !== data.walletAddress) {
                setError(`Wrong wallet connected. Expected: ${data.walletAddress.slice(0, 8)}...${data.walletAddress.slice(-6)}`);
                setStatus('error');
            }

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('Failed to load signing request:', errorMessage);
            setError(errorMessage);
            setStatus('error');
        }
    }, [signingId, wallet.connected, wallet.account?.address]);

    useEffect(() => {
        if (signingId) {
            loadSigningRequest();
        }
    }, [signingId, loadSigningRequest]);

    const signTransaction = async () => {
        if (!wallet.connected || !signingRequest) {
            setError('Wallet not connected or no signing request');
            return;
        }

        try {
            setIsLoading(true);
            setStatus('signing');
            setError('');

            // Convert number array back to Uint8Array
            const txBytes = new Uint8Array(signingRequest.txBytes);

            console.log('Signing transaction...', {
                operationType: signingRequest.operationType,
                txBytesLength: txBytes.length
            });

            // Create a transaction object that matches Suiet's expected interface
            const transactionObject = {
                toJSON: async () => {
                    // Convert bytes to base64 for JSON serialization
                    return btoa(String.fromCharCode(...Array.from(txBytes)));
                }
            };

            // Sign with Suiet wallet
            const signedTx = await wallet.signTransaction({
                transaction: transactionObject,
            }) as SignedTransaction;

            console.log('Raw signedTx object:', signedTx);

            // Extract signature and public key with multiple fallbacks
            const signature = signedTx.signature ?? 
                            signedTx.txSignature ?? 
                            signedTx.signatures?.[0] ?? 
                            null;

            const publicKey = signedTx.publicKey ?? 
                            signedTx.pubKey ?? 
                            signedTx.public_key ?? 
                            (wallet.account && typeof wallet.account.publicKey === 'string' 
                                ? wallet.account.publicKey 
                                : wallet.account?.publicKey 
                                    ? Array.from(wallet.account.publicKey).map(b => b.toString(16).padStart(2, '0')).join('') 
                                    : null) ?? 
                            null;

            console.log('Transaction signed (extracted):', { signature, publicKey });

            if (!signature) {
                throw new Error('No signature found in wallet response');
            }

            // Submit signature to server
            const submitPayload: {
                signingId: string;
                signature?: string;
                publicKey?: string;
            } = { signingId: signingId || '' };

            if (signature) submitPayload.signature = signature;
            if (publicKey) submitPayload.publicKey = publicKey;

            const submitResponse = await fetch('https://rinoco.onrender.com/submit-signature', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(submitPayload),
            });

            const submitResult = await submitResponse.json();

            if (submitResult.success) {
                setStatus('success');
                console.log('Signature submitted successfully');

                // Call completion callback after a short delay
                setTimeout(() => {
                    onComplete?.();
                }, 2000);
            } else {
                throw new Error(submitResult.error || 'Failed to submit signature');
            }

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('Signing error:', err);
            setError(`Signing failed: ${errorMessage}`);
            setStatus('error');

            // Report error to server
            try {
                await fetch('https://rinoco.onrender.com/submit-signature', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        signingId: signingId,
                        error: errorMessage
                    })
                });
            } catch (reportError) {
                console.error('Failed to report error:', reportError);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const cancelTransaction = async () => {
        try {
            await fetch('https://rinoco.onrender.com/submit-signature', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    signingId: signingId,
                    error: 'User cancelled transaction'
                })
            });

            setStatus('cancelled');
            setTimeout(() => {
                onComplete?.();
            }, 1000);

        } catch (error) {
            console.error('Cancel error:', error);
            onComplete?.();
        }
    };

    if (!signingId) {
        return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <h3 className="text-lg font-medium text-yellow-800">No Signing Request</h3>
                <p className="text-yellow-700">No transaction signing request found.</p>
            </div>
        );
    }

    if (status === 'loading') {
        return (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                    <h3 className="text-lg font-medium text-blue-800">Loading Transaction</h3>
                </div>
                <p className="text-blue-700 mt-2">Loading transaction details...</p>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <h3 className="text-lg font-medium text-red-800">Signing Error</h3>
                <p className="text-red-700 mt-2">{error}</p>
                <button
                    onClick={() => window.close()}
                    className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                    Close
                </button>
            </div>
        );
    }

    if (status === 'success') {
        return (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <h3 className="text-lg font-medium text-green-800">Transaction Signed!</h3>
                <p className="text-green-700 mt-2">
                    Your transaction has been signed successfully. The game will process it shortly.
                </p>
                <div className="mt-4">
                    <button
                        onClick={() => window.close()}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                        Close Window
                    </button>
                </div>
            </div>
        );
    }

    if (status === 'cancelled') {
        return (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                <h3 className="text-lg font-medium text-gray-800">Transaction Cancelled</h3>
                <p className="text-gray-700 mt-2">The transaction was cancelled.</p>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto p-6">
            <div className="bg-white shadow-lg rounded-lg">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-bold text-gray-900">Sign Transaction</h2>
                    <p className="text-gray-600">Your game is requesting a blockchain transaction signature</p>
                </div>

                {/* Wallet Status */}
                <div className="px-6 py-4 bg-blue-50">
                    <div className="flex items-center justify-between">
                        <span className="font-medium text-blue-800">Connected Wallet:</span>
                        <span className="text-blue-600">
                            {wallet.connected ?
                                `${wallet.name} (${wallet.account?.address?.slice(0, 8)}...${wallet.account?.address?.slice(-6)})` :
                                'Not connected'
                            }
                        </span>
                    </div>
                </div>

                {/* Transaction Details */}
                {signingRequest && (
                    <div className="px-6 py-4">
                        <h3 className="font-medium text-gray-900 mb-3">Transaction Details</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-600">Operation:</span>
                                <span className="text-gray-900">{signingRequest.operationType}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-600">Description:</span>
                                <span className="text-gray-900">{signingRequest.description}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-600">Wallet Address:</span>
                                <span className="text-gray-900 font-mono text-xs">
                                    {signingRequest.walletAddress}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-medium text-gray-600">Timestamp:</span>
                                <span className="text-gray-900">
                                    {new Date(signingRequest.timestamp).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Status Messages */}
                {error && (
                    <div className="px-6 py-4 bg-red-50 border-l-4 border-red-400">
                        <p className="text-red-700">{error}</p>
                    </div>
                )}

                {status === 'signing' && (
                    <div className="px-6 py-4 bg-yellow-50 border-l-4 border-yellow-400">
                        <div className="flex items-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-yellow-600 mr-3"></div>
                            <p className="text-yellow-700">Signing transaction... Please confirm in your wallet.</p>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="px-6 py-4 bg-gray-50 flex space-x-4">
                    <button
                        onClick={signTransaction}
                        disabled={!wallet.connected || isLoading || status !== 'ready'}
                        className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isLoading && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        )}
                        {status === 'signing' ? 'Signing...' : 'Sign Transaction'}
                    </button>
                    <button
                        onClick={cancelTransaction}
                        disabled={isLoading}
                        className="flex-1 bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}