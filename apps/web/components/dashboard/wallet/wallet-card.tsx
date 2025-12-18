'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Chain } from '@/lib/chains';
import { WalletData } from '@/hooks/useWalletV2';

interface WalletCardProps {
  wallet: WalletData | null;
  chain: Chain;
  loading: boolean;
  error: string | null;
}

export function WalletCard({ wallet, chain, loading, error }: WalletCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const truncateAddress = (address: string) => {
    if (address.length <= 15) return address;
    return `${address.slice(0, 7)}...${address.slice(-5)}`;
  };

  const copyToClipboard = async () => {
    if (!wallet?.address) return;
    
    try {
      await navigator.clipboard.writeText(wallet.address);
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 1500);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  return (
    <div 
      className={`rounded-3xl p-6 md:p-8 shadow-lg bg-white min-h-[150px] flex items-center justify-center relative ${
        wallet ? 'cursor-pointer hover:shadow-xl transition-shadow duration-200' : ''
      }`}
      onClick={wallet ? copyToClipboard : undefined}
    >
      {/* Wallet address or loading state */}
      <div className="text-center space-y-2 w-full">
        {error ? (
          // Error state
          <div className="flex flex-col items-center gap-2">
            <p className="text-red-500 text-sm md:text-base font-rubik-medium">
              {error}
            </p>
          </div>
        ) : loading && !wallet ? (
          // Loading state
          <div className="flex items-center justify-center gap-2">
            <div className="rounded-lg px-4 py-2 flex items-center gap-2">
              <Loader2 className="h-6 w-6 md:h-5 md:w-5 animate-spin text-gray-900" />
              <span className="text-gray-900 font-semibold text-3xl md:text-2xl font-rubik-medium">
                Loading...
              </span>
            </div>
          </div>
        ) : wallet ? (
          // Wallet loaded
          <div className="space-y-2 relative">
            <p className="text-gray-800 text-medium md:text-base font-rubik-light">
              {chain.name} Wallet
            </p>
            <div className="flex items-center justify-center ">
              <div className="rounded-lg px-4 flex items-center gap-2">
                <span className="text-gray-800 font-semibold text-4xl md:text-2xl font-rubik-medium">
                  {truncateAddress(wallet.address)}
                </span>
              </div>
            </div>
            {/* Copied notification positioned below the address */}
            {showTooltip && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 pointer-events-none z-10">
                <div className="bg-gray-800 text-white text-sm px-3 py-1.5 rounded-md shadow-md font-medium">
                  Copied!
                </div>
              </div>
            )}
          </div>
        ) : (
          // No wallet
          <div className="flex flex-col items-center gap-2">
            <p className="text-gray-500 text-sm md:text-base font-rubik-medium">
              No wallet found for {chain.name}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
