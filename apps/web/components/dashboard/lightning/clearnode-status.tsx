'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Copy, Plus, RefreshCw, Wallet } from 'lucide-react';
import { useLightningNodes } from '@/hooks/lightning-nodes-context';

interface ClearnodeStatusProps {
  onAddToUnifiedBalance?: () => void;
}

/**
 * Clearnode Connection Status Component
 * 
 * Shows:
 * - Connection status (connected/connecting/error)
 * - Authenticated wallet address
 * - Custody balance (on-chain Custody contract)
 * - Unified balance from Clearnode
 * - Session timestamp for verification
 * - Add to Unified Balance button
 * 
 * Integrated with useLightningNodes hook for production use
 */
export function ClearnodeStatus({ onAddToUnifiedBalance }: ClearnodeStatusProps) {
  const {
    authenticated,
    authenticating,
    walletAddress,
    error,
    authenticate,
    fetchCustodyBalance,
  } = useLightningNodes();

  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedTimestamp, setCopiedTimestamp] = useState(false);
  const [custodyBalance, setCustodyBalance] = useState<string | null>(null);
  const [custodyLoading, setCustodyLoading] = useState(false);
  
  // Track if we've already fetched custody balance to prevent infinite loops
  const hasFetchedCustodyBalance = useRef(false);

  // Generate verification timestamp (for user to verify connection)
  const verificationTimestamp = useMemo(() => {
    if (authenticated && walletAddress) {
      return `0x${Date.now().toString(16).slice(-8)}`;
    }
    return null;
  }, [authenticated, walletAddress]);

  const handleCopyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleCopyTimestamp = () => {
    if (verificationTimestamp) {
      navigator.clipboard.writeText(verificationTimestamp);
      setCopiedTimestamp(true);
      setTimeout(() => setCopiedTimestamp(false), 2000);
    }
  };

  const handleRetry = () => {
    authenticate('base');
  };

  const handleRefreshBalance = async () => {
    // Reset fetch flag to allow manual refresh
    hasFetchedCustodyBalance.current = false;
    
    // Fetch custody balance
    if (fetchCustodyBalance) {
      setCustodyLoading(true);
      const result = await fetchCustodyBalance('base', 'usdc');
      if (result) {
        setCustodyBalance(result.balanceFormatted);
      }
      setCustodyLoading(false);
    }
  };

  // Fetch custody balance when authenticated (only once)
  useEffect(() => {
    if (authenticated && fetchCustodyBalance && !hasFetchedCustodyBalance.current) {
      hasFetchedCustodyBalance.current = true;
      setCustodyLoading(true);
      fetchCustodyBalance('base', 'usdc').then(result => {
        if (result) {
          setCustodyBalance(result.balanceFormatted);
        }
        setCustodyLoading(false);
      });
    }
  }, [authenticated, fetchCustodyBalance]);

  // Show minimal state during initialization
  return (
    <div className="mb-4">
      {/* Compact Status Strip */}
      <div 
        className={`
          border rounded-lg px-4 py-2.5 transition-all flex items-center justify-between gap-4
          ${authenticated ? 'bg-emerald-50 border-emerald-200' : ''}
          ${(authenticating || (!authenticated && !error)) ? 'bg-blue-50 border-blue-200' : ''}
          ${error && !authenticated ? 'bg-red-50 border-red-200' : ''}
        `}
      >
        {/* Left: Status */}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* Status Icon */}
          {(authenticating || (!authenticated && !error)) && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-600 flex-shrink-0" />
          )}
          {authenticated && !authenticating && (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          )}
          {error && !authenticated && !authenticating && (
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          )}

          {/* Status Text */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-rubik-medium text-sm text-gray-900 whitespace-nowrap">
              {(authenticating || (!authenticated && !error)) && 'Connecting to Clearnode'}
              {authenticated && !authenticating && 'Connected to Clearnode'}
              {error && !authenticated && 'Connection Failed'}
            </span>
            
            {authenticated && !authenticating && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 rounded-full">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-xs font-rubik-medium text-emerald-700">Live</span>
              </div>
            )}

            {/* Error Retry */}
            {error && !authenticated && (
              <button
                onClick={handleRetry}
                className="text-xs font-rubik-medium text-red-600 hover:text-red-700 underline"
              >
                Try Again
              </button>
            )}
          </div>
        </div>

        {/* Right: Add to Unified Balance Button */}
        {authenticated && (
          <button
            onClick={onAddToUnifiedBalance}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-black hover:bg-gray-800 text-white rounded-lg font-rubik-medium text-xs transition-all shadow-sm hover:shadow-md flex-shrink-0 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            Add to Unified Balance
          </button>
        )}
      </div>

      {/* Expandable Details (Collapsible) */}
      {authenticated && walletAddress && (
        <div className="mt-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-start justify-between gap-4">
            {/* Left: Wallet & Session Info */}
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-4 flex-wrap text-xs">
                {/* Wallet Address */}
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Wallet:</span>
                  <code className="font-mono text-gray-700">
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </code>
                  <button
                    onClick={handleCopyAddress}
                    className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                    title="Copy wallet address"
                  >
                    <Copy className={`h-3 w-3 ${copiedAddress ? 'text-emerald-600' : 'text-gray-500'}`} />
                  </button>
                  {copiedAddress && (
                    <span className="text-emerald-600">Copied!</span>
                  )}
                </div>

                {/* Session Verification ID */}
                {verificationTimestamp && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">Session:</span>
                    <code className="font-mono text-gray-700">{verificationTimestamp}</code>
                    <button
                      onClick={handleCopyTimestamp}
                      className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                      title="Copy session ID"
                    >
                      <Copy className={`h-3 w-3 ${copiedTimestamp ? 'text-emerald-600' : 'text-gray-500'}`} />
                    </button>
                    {copiedTimestamp && (
                      <span className="text-emerald-600">Copied!</span>
                    )}
                  </div>
                )}
              </div>

              {/* Custody Balance (only show if there's a balance) */}
              {custodyBalance && parseFloat(custodyBalance) > 0 && (
                <div className="flex items-center gap-2 pt-1 border-t border-gray-200">
                  <Wallet className="h-3.5 w-3.5 text-blue-600" />
                  <span className="text-xs text-gray-500">Available (Custody SC):</span>
                  {custodyLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                  ) : (
                    <span className="text-xs font-rubik-medium text-blue-700">
                      {custodyBalance} USDC
                    </span>
                  )}
                  <div 
                    className="px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 cursor-help"
                    title="Funds deposited to Custody smart contract. Create a channel to move to Unified Balance."
                  >
                    On-chain
                  </div>
                  <button
                    onClick={handleRefreshBalance}
                    disabled={custodyLoading}
                    className="p-0.5 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
                    title="Refresh custody balance"
                  >
                    <RefreshCw className={`h-3 w-3 text-gray-500 ${custodyLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}