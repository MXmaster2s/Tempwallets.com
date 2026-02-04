"use client";

// DashboardNavbar removed - MVP only shows Wallet section
import UpperBar from "@/components/dashboard/ui/upper-bar";
import WalletInfo from "@/components/dashboard/wallet/wallet-info";
import { BalanceTransactionsToggle } from "@/components/dashboard/balance/balance-transactions-toggle";
import { DashboardTracker } from "@/components/analytics/dashboard-tracker";
import { SendCryptoModal } from "@/components/dashboard/modals/send-crypto-modal";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";

export default function Home() {
  const { userId } = useAuth();
  const [sendModalConfig, setSendModalConfig] = useState<{ open: boolean; chain: string; tokenSymbol?: string } | null>(null);
  // Default to ethereumErc4337, matching DEFAULT_CHAIN
  const [selectedChainId, setSelectedChainId] = useState('ethereumErc4337');

  const handleOpenSend = (chain: string, tokenSymbol?: string) => {
    setSendModalConfig({ open: true, chain, tokenSymbol });
  };

  const handleChainChange = (chainId: string) => {
    setSelectedChainId(chainId);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto max-w-7xl py-8">
        <div className="min-h-screen">
          <DashboardTracker />
          {/* Upper Bar - Mobile Only */}
          <UpperBar />

          {/* Main Content with padding for wallet info */}
          <div className="pt-16 lg:pt-20 py-8 px-4 sm:px-6 lg:px-8 space-y-6">
            <WalletInfo
              onOpenSend={handleOpenSend}
              selectedChainId={selectedChainId}
              onChainChange={handleChainChange}
            />
          </div>

          {/* Balance/Transactions Toggle - Full width on mobile, constrained on desktop */}
          <BalanceTransactionsToggle
            onOpenSend={handleOpenSend}
            selectedChainId={selectedChainId}
          />

          {/* Global Send Crypto Modal */}
          {userId && sendModalConfig && (
            <SendCryptoModal
              open={sendModalConfig.open}
              onOpenChange={(open) => !open && setSendModalConfig(null)}
              chain={sendModalConfig.chain}
              userId={userId}
              initialTokenSymbol={sendModalConfig.tokenSymbol}
              onSuccess={() => {
                // Optional: trigger global refresh if needed
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
