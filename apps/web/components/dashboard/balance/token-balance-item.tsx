'use client';

import { useTokenIcon } from '@/lib/token-icons';

interface TokenBalanceItemProps {
  chain: string;
  symbol: string;
  balance: string;
  decimals: number;
  balanceHuman?: string;
  valueUsd?: number;
  isNative?: boolean;
  chainName?: string;
  isHidden?: boolean;
  onOpenSend?: (chain: string, tokenSymbol?: string) => void;
}

/**
 * Format balance from smallest units to human-readable
 */
function formatBalance(balance: string, decimals: number): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return '0';
  const humanReadable = num / Math.pow(10, decimals);

  // Format based on magnitude
  if (humanReadable < 0.000001) return '< 0.000001';
  if (humanReadable < 0.001) return humanReadable.toFixed(6);
  if (humanReadable < 1) return humanReadable.toFixed(4);
  return humanReadable.toFixed(2);
}

/**
 * Format currency
 */
function formatCurrency(value?: number) {
  if (value === undefined || value === null) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Presentational component for single token balance
 * sleek white theme design
 */
export function TokenBalanceItem({
  chain,
  symbol,
  balance,
  decimals,
  balanceHuman,
  valueUsd,
  chainName,
  isHidden = false,
  onOpenSend,
}: TokenBalanceItemProps) {
  const Icon = useTokenIcon(chain, symbol);
  const displayBalance = balanceHuman || formatBalance(balance, decimals);
  const displayValue = formatCurrency(valueUsd);


  return (
    <button
      onClick={() => onOpenSend?.(chain, symbol)}
      className="w-full text-left group flex items-center justify-between p-2 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all duration-200 cursor-pointer"
    >
      {/* Left side: Logo + Info */}
      <div className="flex items-center gap-3">
        {/* Token Icon with light background */}
        <div className="relative flex items-center justify-center w-8 h-8 bg-gray-50 rounded-full border border-gray-50 group-hover:border-gray-100 transition-colors">
          <Icon
            className="w-4 h-4"
            style={{ fill: 'currentColor' }}
          />
          {/* Small chain badge could go here if needed */}
        </div>

        {/* Token Details */}
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-gray-900 group-hover:text-black transition-colors">
            {symbol}
          </span>
          <span className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] uppercase tracking-wider text-gray-600">
              {chainName}
            </span>
          </span>
        </div>
      </div>

      {/* Right side: Amount and Value */}
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm font-bold text-gray-900">
          {isHidden ? '••••••' : displayValue}
        </span>
        <span className="text-xs font-medium text-gray-500">
          {isHidden ? '••••' : displayBalance} <span className="text-gray-400">{symbol}</span>
        </span>
      </div>
    </button>
  );
}
