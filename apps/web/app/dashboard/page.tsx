"use client";

import UpperBar from "@/components/dashboard/upper-bar";
import WalletInfo from "@/components/dashboard/wallet-info";
import RecentTransactions from "@/components/dashboard/recent-transactions";

export default function DashboardPage() {
  return (
    <div className="min-h-screen">
      {/* Upper Bar - Mobile Only */}
      <UpperBar />

      {/* Main Content */}
      <div className="pt-16 lg:pt-20 py-8">
        <WalletInfo />
        <RecentTransactions />
      </div>
    </div>
  );
}

