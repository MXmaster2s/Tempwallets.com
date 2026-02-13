"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Loader2, Zap, Info } from "lucide-react";
import { useWalletData } from "@/hooks/useWalletData";
import { useAuth } from "@/hooks/useAuth";
import { custodyApi, type UnifiedBalanceEntry } from "@/lib/api";
import { TokenBalanceItem } from "./token-balance-item";
import { NormalizedBalance } from "@/types/wallet-data";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";

const CHAIN_NAMES: Record<string, string> = {
  // Zerion canonical chain ids
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  solana: "Solana",
  avalanche: "Avalanche",
  // Legacy/internal
  tron: "Tron",
  bitcoin: "Bitcoin",
  // Polkadot EVM Compatible chains
  moonbeamTestnet: "Moonbeam Testnet",
  astarShibuya: "Astar Shibuya",
  paseoPassetHub: "Paseo PassetHub",
  // Substrate/Polkadot chains
  polkadot: "Polkadot",
  hydrationSubstrate: "Hydration",
  bifrostSubstrate: "Bifrost",
  uniqueSubstrate: "Unique",
  paseo: "Paseo",
  paseoAssethub: "Paseo AssetHub",
  // Testnets
  sepolia: "Sepolia Testnet",
};

/**
 * Container component that displays token balances
 * Uses useWalletData hook to get balances from provider
 */
export function BalanceView() {
  const { balances, loading, errors } = useWalletData();
  const { userId } = useAuth();

  const [unifiedBalances, setUnifiedBalances] = useState<
    UnifiedBalanceEntry[] | null
  >(null);
  const [unifiedLoading, setUnifiedLoading] = useState(false);
  const [unifiedError, setUnifiedError] = useState<string | null>(null);

  const fetchUnifiedBalance = async () => {
    if (!userId) return;
    setUnifiedLoading(true);
    setUnifiedError(null);
    try {
      const res = await custodyApi.getUnifiedBalance({ userId, chain: "base" });
      setUnifiedBalances(res.data.balances);
    } catch (e) {
      setUnifiedBalances(null);
      setUnifiedError(
        e instanceof Error ? e.message : "Failed to fetch unified balance",
      );
    } finally {
      setUnifiedLoading(false);
    }
  };

  // Group balances by chain and filter to show only non-zero balances
  const groupedBalances = useMemo(() => {
    // Group by chain
    const byChain = new Map<string, NormalizedBalance[]>();

    for (const balance of balances) {
      // Only include balances that are greater than 0
      const balanceValue = parseFloat(balance.balance);
      if (balanceValue <= 0) continue;

      const existing = byChain.get(balance.chain) || [];
      existing.push(balance);
      byChain.set(balance.chain, existing);
    }

    // Convert to array and sort by chain name
    const grouped: Array<{ chain: string; balances: NormalizedBalance[] }> = [];

    for (const [chain, chainBalances] of byChain.entries()) {
      // Sort: native first, then by symbol
      const sorted = chainBalances.sort((a, b) => {
        if (a.isNative && !b.isNative) return -1;
        if (!a.isNative && b.isNative) return 1;
        return a.symbol.localeCompare(b.symbol);
      });

      grouped.push({ chain, balances: sorted });
    }

    // Sort groups by chain name
    grouped.sort((a, b) => a.chain.localeCompare(b.chain));

    return grouped;
  }, [balances]);

  // Show loading state
  if (loading.balances && balances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
        <p className="text-gray-500 font-rubik-normal">Loading balances...</p>
      </div>
    );
  }

  // Show empty state (including when there are errors)
  if (
    groupedBalances.length === 0 ||
    (errors.balances && balances.length === 0)
  ) {
    return (
      <div className="flex flex-col items-center justify-center py-16 md:py-20">
        {/* Empty Mailbox GIF */}
        <div className="-mt-32">
          <Image
            src="/empty-mailbox-illustration-with-spiderweb-and-flie-2025-10-20-04-28-09-utc.gif"
            alt="Empty mailbox illustration"
            width={320}
            height={320}
            className="object-contain mix-blend-multiply"
          />
        </div>
        <p className="text-gray-600 text-lg md:text-xl font-rubik-medium z-10 -mt-16">
          No Balance Available
        </p>
      </div>
    );
  }

  // Render balances grouped by chain
  return (
    <div className="space-y-6">
      {/* Unified Balance Button with Tooltip */}
      <div className="flex justify-end">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={fetchUnifiedBalance}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                {unifiedLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Unified Balance
                <Info className="h-3 w-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-xs">
                Shows your Yellow Network off-chain ledger balance (used for
                Lightning Nodes). Click to refresh.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {unifiedError && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {unifiedError}
        </div>
      )}

      {unifiedBalances && unifiedBalances.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-rubik-medium text-gray-900">
              Unified Balance (Yellow)
            </p>
            <p className="text-[10px] text-gray-500">Base</p>
          </div>
          <div className="space-y-2">
            {unifiedBalances.map((b) => (
              <div
                key={b.asset}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-700 font-mono">{b.asset}</span>
                <span className="text-gray-900 font-rubik-medium">
                  {(Number(b.available ?? b.amount) / 1e6).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {groupedBalances.map(({ chain, balances: chainBalances }) => (
        <div key={chain} className="space-y-2">
          <div className="space-y-2">
            {chainBalances.map((balance, index) => {
              // Only non-zero balances are shown (filtered in groupedBalances)
              const key = balance.isNative
                ? `${chain}-native`
                : `${chain}-${balance.address || balance.symbol}-${index}`;

              return (
                <TokenBalanceItem
                  key={key}
                  chain={balance.chain}
                  symbol={balance.symbol}
                  balance={balance.balance}
                  decimals={balance.decimals}
                  balanceHuman={balance.balanceHuman}
                  isNative={balance.isNative}
                  chainName={CHAIN_NAMES[chain] || chain}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
