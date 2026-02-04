"use client";
import UpperBar from "@/components/dashboard/ui/upper-bar";
import WalletInfo from "@/components/dashboard/wallet/wallet-info";
import { BalanceTransactionsToggle } from "@/components/dashboard/balance/balance-transactions-toggle";
import { DashboardTracker } from "@/components/analytics/dashboard-tracker";
import { useState } from "react";

export default function Home() {
  const [selectedChainId, setSelectedChainId] = useState('ethereumErc4337'); // Default

  const handleChainChange = (chainId: string) => {
    setSelectedChainId(chainId);
  };

  // Optional: If Send functionality is needed here, we'd need the modal state too.
  // For now, we just pass the required chain props to satisfy the build.

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
              selectedChainId={selectedChainId}
              onChainChange={handleChainChange}
            />
          </div>

          {/* Balance/Transactions Toggle - Full width on mobile, constrained on desktop */}
          <BalanceTransactionsToggle
            selectedChainId={selectedChainId}
          />
        </div>
      </main>
    </div>
  );
}
