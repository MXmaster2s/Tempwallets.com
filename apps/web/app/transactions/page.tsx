"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { walletApi, WalletBalance } from "@/lib/api";
import { walletStorage } from "@/lib/walletStorage";
import { Loader2, AlertCircle, Wallet, TrendingUp, RefreshCw } from "lucide-react";

const TransactionsPage = () => {
  const { wallets, loading, error } = useWallet();
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  
  // For demo purposes, using a static userId. In a real app, this would come from auth context
  const userId = "demo-user-123";

  useEffect(() => {
    const fetchBalances = async () => {
      setBalancesLoading(true);
      setBalancesError(null);
      
      try {
        // Always fetch fresh balances (not cached)
        const balanceData = await walletApi.getBalances(userId);
        setBalances(balanceData);
      } catch (err) {
        setBalancesError(err instanceof Error ? err.message : 'Failed to fetch balances');
        console.error('Error fetching balances:', err);
      } finally {
        setBalancesLoading(false);
      }
    };

    // Only fetch balances if we have cached addresses (wallets are loaded)
    const cachedAddresses = walletStorage.getAddresses(userId);
    if (cachedAddresses) {
      fetchBalances();
    }
  }, [userId, wallets.length]); // Re-fetch when wallets change

  const refreshBalances = async () => {
    setBalancesLoading(true);
    setBalancesError(null);
    
    try {
      const balanceData = await walletApi.getBalances(userId);
      setBalances(balanceData);
    } catch (err) {
      setBalancesError(err instanceof Error ? err.message : 'Failed to fetch balances');
      console.error('Error fetching balances:', err);
    } finally {
      setBalancesLoading(false);
    }
  };

  const formatBalance = (balance: string, chain: string): string => {
    const numBalance = parseFloat(balance);
    if (isNaN(numBalance)) return '0.00';
    
    // Format based on chain
    if (chain.toLowerCase().includes('bitcoin')) {
      return `${numBalance.toFixed(8)} BTC`;
    } else if (chain.toLowerCase().includes('ethereum') || chain.toLowerCase().includes('erc4337')) {
      return `${numBalance.toFixed(4)} ETH`;
    } else if (chain.toLowerCase().includes('solana')) {
      return `${numBalance.toFixed(4)} SOL`;
    } else if (chain.toLowerCase().includes('tron')) {
      return `${numBalance.toFixed(4)} TRX`;
    } else {
      return `${numBalance.toFixed(4)} ${chain.toUpperCase()}`;
    }
  };

  const getChainIcon = (chain: string) => {
    if (chain.toLowerCase().includes('bitcoin')) return '₿';
    if (chain.toLowerCase().includes('ethereum') || chain.toLowerCase().includes('erc4337')) return 'Ξ';
    if (chain.toLowerCase().includes('solana')) return '◎';
    if (chain.toLowerCase().includes('tron')) return 'TRX';
    return '●';
  };

  const getChainName = (chain: string) => {
    const chainMap: Record<string, string> = {
      'ethereum': 'Ethereum',
      'tron': 'Tron',
      'bitcoin': 'Bitcoin',
      'solana': 'Solana',
      'ethereumErc4337': 'Ethereum ERC-4337',
      'baseErc4337': 'Base ERC-4337',
      'arbitrumErc4337': 'Arbitrum ERC-4337',
      'polygonErc4337': 'Polygon ERC-4337',
    };
    return chainMap[chain] || chain;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-background/50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-header-text mb-2">
                Wallet Balances
              </h1>
              <p className="text-header-text/70 text-sm md:text-base">
                Initial balances across all supported networks
              </p>
            </div>
            
            {/* Refresh Button */}
            <button
              onClick={refreshBalances}
              disabled={balancesLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-wallet-gradient-from to-wallet-gradient-to text-wallet-text rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${balancesLoading ? 'animate-spin' : ''}`} />
              <span className="text-sm font-medium">
                {balancesLoading ? 'Refreshing...' : 'Refresh Balances'}
              </span>
            </button>
          </div>
          
          {/* Cache Info */}
          {walletStorage.hasValidCache(userId) && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-700 text-sm">
                  Using cached addresses (cache age: {walletStorage.getCacheAge().toFixed(1)} hours)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Error States */}
        {(error || balancesError) && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-red-700 text-sm">
                {error || balancesError}
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {(loading || balancesLoading) && (
          <div className="bg-gradient-to-br from-wallet-gradient-from to-wallet-gradient-to rounded-2xl p-8 mb-6">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-wallet-text mx-auto" />
              <p className="text-wallet-text text-sm md:text-base font-semibold">
                Loading wallet data...
              </p>
            </div>
          </div>
        )}

        {/* Balances Grid */}
        {!loading && !balancesLoading && balances.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {balances.map((balance, index) => (
              <div
                key={index}
                className="bg-gradient-to-br from-wallet-gradient-from to-wallet-gradient-to rounded-2xl p-6 shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-wallet-text/20 flex items-center justify-center">
                      <span className="text-wallet-text font-bold text-lg">
                        {getChainIcon(balance.chain)}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-wallet-text font-semibold text-sm md:text-base">
                        {getChainName(balance.chain)}
                      </h3>
                      <p className="text-wallet-text/70 text-xs">
                        {balance.chain}
                      </p>
                    </div>
                  </div>
                  <Wallet className="h-5 w-5 text-wallet-text/50" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-wallet-text/70 text-sm">Balance</span>
                    <span className="text-wallet-amount font-bold text-lg md:text-xl">
                      {formatBalance(balance.balance, balance.chain)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-wallet-text/50 text-xs">
                    <TrendingUp className="h-3 w-3" />
                    <span>Initial balance</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !balancesLoading && balances.length === 0 && !error && !balancesError && (
          <div className="bg-gradient-to-br from-wallet-gradient-from to-wallet-gradient-to rounded-2xl p-8">
            <div className="text-center space-y-4">
              <Wallet className="h-12 w-12 text-wallet-text/50 mx-auto" />
              <h3 className="text-wallet-text text-lg font-semibold">
                No balances found
              </h3>
              <p className="text-wallet-text/70 text-sm">
                Create a wallet to see initial balances across all networks
              </p>
            </div>
          </div>
        )}

        {/* Summary */}
        {balances.length > 0 && (
          <div className="mt-8 bg-gradient-to-r from-wallet-gradient-from to-wallet-gradient-to rounded-2xl p-6">
            <div className="text-center">
              <h3 className="text-wallet-text text-lg font-semibold mb-2">
                Total Networks
              </h3>
              <p className="text-wallet-amount text-2xl font-bold">
                {balances.length}
              </p>
              <p className="text-wallet-text/70 text-sm mt-1">
                Supported blockchain networks
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionsPage;
