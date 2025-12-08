"use client";

// DashboardNavbar removed - MVP only shows Wallet section
import UpperBar from "@/components/dashboard/upper-bar";
import WalletInfo from "@/components/dashboard/wallet-info";
import { BalanceTransactionsToggle } from "@/components/dashboard/balance-transactions-toggle";
import { DashboardTracker } from "@/components/analytics/dashboard-tracker";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto max-w-7xl py-8">
        <div className="min-h-screen">
          <DashboardTracker />
          {/* Upper Bar - Mobile Only */}
          <UpperBar />

          {/* Main Content with padding for wallet info */}
          <div className="pt-16 lg:pt-20 py-8 px-4 sm:px-6 lg:px-8 space-y-6">
            <WalletInfo />
          </div>
          
          {/* Balance/Transactions Toggle - Full width on mobile, constrained on desktop */}
          <BalanceTransactionsToggle />
        </div>
      </main>
    </div>
  );
}
