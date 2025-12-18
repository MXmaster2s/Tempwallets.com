'use client';

import { useTokenIcon } from '@/lib/token-icons';

interface TokenBalanceItemProps {
  chain: string;
  symbol: string;
  balance: string;
  decimals: number;
  balanceHuman?: string;
  isNative?: boolean;
  chainName?: string;
}

/**
 * Format balance from smallest units to human-readable
 */
function formatBalance(balance: string, decimals: number): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return '0';
  const humanReadable = num / Math.pow(10, decimals);
  return humanReadable.toFixed(6).replace(/\.?0+$/, '');
}

/**
 * Presentational component for single token balance
 * Layout: Logo + Chain name on left, Balance + Symbol on right
 */
export function TokenBalanceItem({
  chain,
  symbol,
  balance,
  decimals,
  balanceHuman,
  chainName,
}: TokenBalanceItemProps) {
  const Icon = useTokenIcon(chain, symbol);
  const displayBalance = balanceHuman || formatBalance(balance, decimals);

  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all">
      {/* Left side: Logo + Chain name side by side */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center">
          <Icon
            className="w-8 h-8 md:w-8 md:h-8"
            style={{ fill: 'currentColor', color: '#627EEA' }}
          />
        </div>
        {chainName && (
          <div className="text-sm text-gray-700 font-rubik-medium">
            {chainName}
          </div>
        )}
      </div>

      {/* Right side: Balance and Symbol */}
      <div className="flex-1 text-right">
        <div className="text-lg md:text-xl font-semibold text-gray-900 font-rubik-medium">
          {displayBalance} <span className="text-sm text-gray-600 font-normal">{symbol}</span>
        </div>
      </div>
    </div>
  );
}
