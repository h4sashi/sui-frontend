// script name: useSuiNetwork.ts

import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { useMemo } from 'react';

export function useSuiClient() {
  return useMemo(() => {
    const network = process.env.NEXT_PUBLIC_SUI_NETWORK || 'devnet';
    const rpcUrl = process.env.NEXT_PUBLIC_SUI_RPC_URL || getFullnodeUrl(network as any);
    
    return new SuiClient({
      url: rpcUrl,
    });
  }, []);
}