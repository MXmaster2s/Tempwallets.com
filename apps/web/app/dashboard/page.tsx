"use client";

import UpperBar from "@/components/dashboard/ui/upper-bar";
import WalletInfo from "@/components/dashboard/wallet/wallet-info";
import { BalanceTransactionsToggle } from "@/components/dashboard/balance/balance-transactions-toggle";
import { DashboardTracker } from "@/components/analytics/dashboard-tracker";
import { SendCryptoModal } from "@/components/dashboard/modals/send-crypto-modal";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";

export default function DashboardPage() {
  const { userId } = useAuth();
  const [sendModalConfig, setSendModalConfig] = useState<{ open: boolean; chain: string; tokenSymbol?: string } | null>(null);
  const [selectedChainId, setSelectedChainId] = useState('ethereumErc4337'); // Default to ethereumErc4337, matching DEFAULT_CHAIN

  const handleOpenSend = (chain: string, tokenSymbol?: string) => {
    setSendModalConfig({ open: true, chain, tokenSymbol });
  };

  const handleChainChange = (chainId: string) => {
    setSelectedChainId(chainId);
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <DashboardTracker />
      {/* Upper Bar - Mobile Only */}
      <UpperBar />

      {/* Main Content with padding for wallet info */}
      <div className="pt-16 lg:pt-20 py-2 px-4 sm:px-6 lg:px-8 space-y-1 flex-shrink-0">
        <WalletInfo
          onOpenSend={handleOpenSend}
          selectedChainId={selectedChainId}
          onChainChange={handleChainChange}
        />
      </div>

      {/* Balance/Transactions Toggle - Full width on mobile, constrained on desktop */}
      <div className="flex-1 flex flex-col">
        <BalanceTransactionsToggle
          onOpenSend={handleOpenSend}
          selectedChainId={selectedChainId}
        />
      </div>

      {/* Global Send Crypto Modal */}
      {userId && sendModalConfig && (
        <SendCryptoModal
          open={sendModalConfig.open}
          onOpenChange={(open) => !open && setSendModalConfig(null)}
          chain={sendModalConfig.chain}
          userId={userId}
          initialTokenSymbol={sendModalConfig.tokenSymbol}
          onSuccess={() => {
            // Optional: trigger global refresh if needed, but components mostly handle their own data
          }}
        />
      )}

      {/* Full-width bottom gradient overlay - Mobile only */}
      <div className="fixed bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/90 via-black/30 to-transparent lg:hidden pointer-events-none z-40" />
    </div>
  );
}

