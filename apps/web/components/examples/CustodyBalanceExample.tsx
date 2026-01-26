/**
 * Custody Balance Example Component
 * 
 * This component demonstrates how to fetch and display the custody balance
 * (on-chain balance in the Custody smart contract) using the new API.
 * 
 * Usage:
 * 1. User deposits funds → Money goes to Custody contract ✅
 * 2. fetchCustodyBalance() → Query the balance ✅
 * 3. Display in UI → Show "Available (Custody SC)" ✅
 */

'use client';

import { useEffect, useState } from 'react';
import { useLightningNodes } from '@/hooks/useLightningNodes';

export default function CustodyBalanceExample() {
  const { fetchCustodyBalance, authenticated } = useLightningNodes();
  const [custodyBalance, setCustodyBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fetch custody balance when authenticated
  useEffect(() => {
    if (authenticated) {
      loadCustodyBalance();
    }
  }, [authenticated]);

  const loadCustodyBalance = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await fetchCustodyBalance('base', 'usdc');
      
      if (result) {
        setCustodyBalance(result.balanceFormatted);
        console.log('✅ Custody balance loaded:', result);
      } else {
        setError('Failed to fetch custody balance');
      }
    } catch (err) {
      console.error('Error loading custody balance:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="p-4 border border-yellow-500 rounded-lg bg-yellow-50">
        <p className="text-sm text-yellow-800">
          Please authenticate first to view custody balance
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 border border-gray-200 rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Custody Balance
        </h3>
        <button
          onClick={loadCustodyBalance}
          disabled={loading}
          className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-gray-900">
            {custodyBalance || '0.000000'}
          </span>
          <span className="text-lg text-gray-500">USDC</span>
        </div>

        <p className="text-xs text-gray-500">
          Available (Custody Smart Contract)
        </p>

        {error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
        <p className="text-xs text-blue-800">
          <strong>What is Custody Balance?</strong><br />
          This shows your deposited balance in the Custody smart contract.
          After depositing, you can move these funds to your unified balance
          (off-chain) by creating a payment channel.
        </p>
      </div>
    </div>
  );
}
