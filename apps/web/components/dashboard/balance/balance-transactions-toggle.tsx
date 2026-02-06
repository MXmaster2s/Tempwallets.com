'use client';

import { useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import { BalanceView } from './balance-view';
import { TransactionList } from '../transactions/transaction-list';
import { LightningNodesView } from '../lightning/lightning-nodes-view';
import { useWalletData } from '@/hooks/useWalletData';
import { LightningNodesProvider } from '@/hooks/lightning-nodes-context';
import { useLightningNodes } from '@/hooks/useLightningNodes';

type ViewType = 'balance' | 'transactions' | 'lightningNodes';

/**
 * Component with three text buttons: "Balance", "Transactions", and "Lightning Nodes"
 * Renders BalanceView when balance is active, RecentTransactions when transactions is active,
 * and LightningNodesView when lightningNodes is active
 * Default to "Balance" view on mount
 */
interface BalanceTransactionsToggleProps {
  onOpenSend?: (chain: string, tokenSymbol?: string) => void;
  selectedChainId: string;
}

export function BalanceTransactionsToggle({ onOpenSend, selectedChainId }: BalanceTransactionsToggleProps) {
  const [activeView, setActiveView] = useState<ViewType>('balance');
  const { loading, refreshBalances, refreshTransactions } = useWalletData();
  const { loading: lightningLoading, refreshNodes } = useLightningNodes();
  const isLoading = loading.balances || loading.transactions || lightningLoading;
  const handleRefresh = () => {
    if (activeView === 'balance') {
      refreshBalances();
    } else if (activeView === 'transactions') {
      refreshTransactions();
    } else if (activeView === 'lightningNodes') {
      refreshNodes();
    }
  };
  return (
    <div className="w-full bg-white rounded-3xl pt-4 border-t border-gray-200 shadow-sm md:max-w-2xl md:mx-auto mt-2 mb-4 flex-1 flex flex-col">
      {/* Top Divider */}
      <div className="flex justify-center mb-2 mx-4 md:mx-6">
        <div className="w-10 h-1 bg-gray-200 rounded-full"></div>
      </div>

      {/* Header with Toggle Buttons and Refresh */}
      <div className="flex items-center justify-between mb-4 mx-4 md:mx-6 relative z-10">
        {/* Toggle Buttons on Left */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveView('balance')}
            type="button"
            className={`font-rubik-medium transition-all cursor-pointer select-none py-2 px-3 -mx-3 rounded-lg relative z-10 ${activeView === 'balance'
              ? 'text-gray-800 font-semibold'
              : 'text-gray-300 hover:text-gray-400'
              }`}
            style={{ touchAction: 'manipulation' }}
          >
            Balance
          </button>
          <button
            onClick={() => setActiveView('transactions')}
            type="button"
            className={`font-rubik-medium transition-all cursor-pointer select-none py-2 px-3 -mx-3 rounded-lg relative z-10 ${activeView === 'transactions'
              ? 'text-gray-800 font-semibold'
              : 'text-gray-300 hover:text-gray-400'
              }`}
            style={{ touchAction: 'manipulation' }}
          >
            Transactions
          </button>
          <button
            onClick={() => setActiveView('lightningNodes')}
            type="button"
            className={`font-rubik-medium transition-all cursor-pointer select-none py-2 px-2 -mx-2 rounded-lg relative z-10 text-sm sm:text-base ${activeView === 'lightningNodes'
              ? 'text-gray-800 font-semibold'
              : 'text-gray-300 hover:text-gray-400'
              }`}
            style={{ touchAction: 'manipulation' }}
          >
            Lightning Nodes
          </button>
        </div>

        {/* Refresh Button on Right */}
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          type="button"
          className="text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50 flex items-center justify-center h-9 w-9 rounded-lg border border-gray-200 hover:border-gray-300 bg-white shadow-sm hover:shadow active:scale-[0.98]"
          style={{ touchAction: 'manipulation' }}
          aria-label="Refresh"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Content Area */}
      <div className="mx-4 md:mx-6 mb-4 flex-1">
        {activeView === 'balance' ? (
          <BalanceView onOpenSend={onOpenSend} selectedChainId={selectedChainId} />
        ) : activeView === 'transactions' ? (
          <TransactionList />
        ) : (
          <LightningNodesProvider>
            <LightningNodesView />
          </LightningNodesProvider>
        )}
      </div>
    </div>
  );
}

