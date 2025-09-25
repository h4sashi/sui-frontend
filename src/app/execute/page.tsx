'use client'

import { useSearchParams } from 'next/navigation';
import { useWallet, ConnectModal } from '@suiet/wallet-kit';
import { useState, useEffect, Suspense } from 'react';
import { Transaction } from '@mysten/sui/transactions';

// Types
type SerializedTransactionData =
    | string
    | Uint8Array
    | number[]
    | {
        serialized?: string;
        bytes?: string | number[] | Uint8Array;
        data?: string;
    }
    | Record<string, unknown>;

interface TransactionResult {
    digest: string;
    effects?: {
        status?: {
            status: 'success' | 'failure';
            error?: string;
        } | string;
    };
    events?: unknown[];
    objectChanges?: unknown[];
}

// Utils: decode helpers
const base64ToUint8Array = (b64: string): Uint8Array | null => {
    try {
        // browser environment: atob available
        const binary = atob(b64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.warn('base64ToUint8Array failed', e);
        return null;
    }
};

const hexToUint8Array = (hex: string): Uint8Array | null => {
    try {
        const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
        if (clean.length % 2 !== 0) return null;
        const len = clean.length / 2;
        const out = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            out[i] = parseInt(clean.substr(i * 2, 2), 16);
        }
        return out;
    } catch (e) {
        console.warn('hexToUint8Array failed', e);
        return null;
    }
};

function parseTransactionData(input: SerializedTransactionData): Transaction | Uint8Array | Record<string, unknown> | string | null {
    // Try to produce either a Transaction (preferred), Uint8Array (serialized bytes), or fallback to object/string
    try {
        // If it's a Transaction instance already
        if ((input as Transaction) instanceof Transaction) {
            return input as Transaction;
        }

        // If it's Uint8Array
        if (input instanceof Uint8Array) {
            try {
                // Transaction.from accepts Uint8Array in many SDK versions
                return Transaction.from(input);
            } catch {
                return input;
            }
        }

        // If it's a numeric array (bytes)
        if (Array.isArray(input) && input.every((v) => typeof v === 'number')) {
            const u = new Uint8Array(input as number[]);
            try {
                return Transaction.from(u);
            } catch {
                return u;
            }
        }

        // If it's a string — might be JSON, base64, or hex, or serialized string
        if (typeof input === 'string') {
            // Try JSON parse
            try {
                const parsed = JSON.parse(input) as SerializedTransactionData;
                // Recurse to handle JSON object forms
                return parseTransactionData(parsed);
            } catch {
                // not JSON — continue
            }

            // Heuristics: base64 (contains non-hex chars and padding =), or hex (0x...)
            if (/^[0-9a-fA-F]+$/.test(input) || input.startsWith('0x')) {
                const maybeHex = hexToUint8Array(input);
                if (maybeHex) {
                    try {
                        return Transaction.from(maybeHex);
                    } catch {
                        return maybeHex;
                    }
                }
            }

            // base64-ish detection
            if (/^[A-Za-z0-9+/=]+$/.test(input) && input.length % 4 === 0) {
                const asBytes = base64ToUint8Array(input);
                if (asBytes) {
                    try {
                        return Transaction.from(asBytes);
                    } catch {
                        return asBytes;
                    }
                }
            }

            // Otherwise treat raw string as serialized transaction string (some SDKs accept)
            try {
                return Transaction.from(input);
            } catch {
                return input;
            }
        }

        // If it's an object
        if (typeof input === 'object' && input !== null) {
            const obj = input as { serialized?: string; bytes?: unknown; data?: string } & Record<string, unknown>;

            // If serialized field exists
            if (typeof obj.serialized === 'string') {
                try {
                    return Transaction.from(obj.serialized);
                } catch {
                    // fallthrough
                }
            }

            // If data field exists
            if (typeof obj.data === 'string') {
                try {
                    return Transaction.from(obj.data);
                } catch {
                    // fallthrough
                }
            }

            // If bytes field exists
            if (obj.bytes != null) {
                // bytes could be base64 string, number[], or Uint8Array
                if (typeof obj.bytes === 'string') {
                    // base64 or hex
                    const asBase64 = base64ToUint8Array(obj.bytes);
                    if (asBase64) {
                        try {
                            return Transaction.from(asBase64);
                        } catch {
                            return asBase64;
                        }
                    }
                    const asHex = hexToUint8Array(obj.bytes);
                    if (asHex) {
                        try {
                            return Transaction.from(asHex);
                        } catch {
                            return asHex;
                        }
                    }
                } else if (Array.isArray(obj.bytes) && obj.bytes.every((v) => typeof v === 'number')) {
                    const u = new Uint8Array(obj.bytes as number[]);
                    try {
                        return Transaction.from(u);
                    } catch {
                        return u;
                    }
                } else if (obj.bytes instanceof Uint8Array) {
                    try {
                        return Transaction.from(obj.bytes as Uint8Array);
                    } catch {
                        return obj.bytes as Uint8Array;
                    }
                }
            }

            // As a last resort return the object itself (wallet implementations sometimes accept the shape)
            return obj as Record<string, unknown>;
        }
    } catch (err) {
        console.warn('parseTransactionData error', err);
    }

    return null;
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
        const reqIdParam = searchParams.get('requestId');
        if (txParam) {
            try {
                const decoded = decodeURIComponent(txParam);
                // Keep the raw parsed value — could be string or JSON
                // Try JSON.parse; if it fails keep the raw string
                try {
                    const parsed = JSON.parse(decoded) as SerializedTransactionData;
                    setTransactionData(parsed);
                } catch {
                    // maybe it's base64/hex/serialized string — keep as string
                    setTransactionData(decoded);
                }
                setStatus('Transaction loaded. Connect wallet to execute.');
            } catch (e) {
                console.error('Error parsing transaction:', e);
                setStatus('Error: Invalid transaction data');
            }
        } else {
            setStatus('Error: No transaction data provided');
        }

        if (reqIdParam) {
            setStatus((prev) => prev + ` (requestId: ${reqIdParam})`);
            // store requestId in window for later POST back to server
            (window as unknown as Record<string, unknown>).__requestId = reqIdParam;
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

        // Helper to safely extract status & error from various shapes
        function parseEffectsStatus(effects?: TransactionResult['effects']): { status?: string; error?: string } {
            if (!effects) return {};
            const s = effects.status;
            if (typeof s === 'string') {
                return { status: s };
            }
            if (typeof s === 'object' && s !== null) {
                // s might be { status: 'success', error?: string } or other shape
                const maybeStatus = (s as Record<string, unknown>)['status'];
                const maybeError = (s as Record<string, unknown>)['error'];
                return {
                    status: typeof maybeStatus === 'string' ? maybeStatus : undefined,
                    error: typeof maybeError === 'string' ? maybeError : undefined
                };
            }
            return {};
        }

        try {
            setIsExecuting(true);
            setStatus('Executing transaction...');

            // Parse transactionData into either Transaction or Uint8Array or object
            const parsed = parseTransactionData(transactionData);
            if (!parsed) {
                throw new Error('Unable to parse transaction payload');
            }

            // The wallet API expects a Transaction-like object or serialized bytes.
            const transactionPayload: unknown = parsed;

            // call wallet.signAndExecuteTransaction - cast only where needed
            const execResult = await wallet.signAndExecuteTransaction({
                transaction: transactionPayload as unknown as Transaction,
            }) as TransactionResult;

            setResult(execResult);

            const { status: effectStatus, error: effectError } = parseEffectsStatus(execResult.effects);

            if (effectStatus === 'success' || effectStatus === 'succeeded' || effectStatus === undefined && execResult && (execResult as unknown as Record<string, unknown>)['digest']) {
                // If SDK returns a plain 'success' string or if we can't parse but there is a digest,
                setStatus(`Transaction successful! Digest: ${execResult.digest}`);

                // notify your server that tx executed for the requestId
                const requestId = (window as unknown as Record<string, unknown>).__requestId as string | undefined;
                if (requestId) {
                    try {
                        const resp = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || ''}/tx-submitted`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                requestId,
                                txDigest: execResult.digest,
                                signer: wallet.account?.address
                            })
                        });
                        const j = await resp.json();
                        console.log('Server tx-submitted response', j);
                    } catch (err) {
                        console.error('Failed to notify server of tx submission', err);
                    }
                } else {
                    console.warn('No requestId present in URL; server cannot watch transaction for this request');
                }

                // Auto-close after 3s to keep UX
                setTimeout(() => window.close(), 3000);
            } else {
                const errorMessage = effectError ?? 'Unknown error';
                setStatus(`Transaction failed: ${errorMessage}`);
            }
        } catch (error) {
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
