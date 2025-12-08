"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { Wallet, Plus, Clock } from "lucide-react";
import { WalletHistoryModal } from "@/components/dashboard/wallet-history-modal";
import { useAuth } from "@/hooks/useAuth";
import { walletApi } from "@/lib/api";
import { toast } from "sonner";

export function WalletManagement() {
  const { userId } = useAuth();
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const handleSwitchWallet = async () => {
    // Reload page to refresh wallet data
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <Card className="bg-[#1a1a1a] border-gray-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <Wallet className="h-5 w-5 text-[#4C856F]" />
                Wallet Management
              </CardTitle>
              <CardDescription className="text-gray-400">
                View and manage your wallets
              </CardDescription>
            </div>
            <Button
              onClick={() => setHistoryModalOpen(true)}
              className="bg-[#4C856F] hover:bg-[#4C856F]/90 text-white"
            >
              <Clock className="h-4 w-4 mr-2" />
              View History
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-6 bg-[#292929] rounded-lg border border-gray-700 text-center">
            <Wallet className="h-12 w-12 text-gray-500 mx-auto mb-3" />
            <div className="text-white font-medium mb-2">Manage Your Wallets</div>
            <div className="text-sm text-gray-400 mb-4">
              View your wallet history, switch between wallets, and manage your wallet labels.
            </div>
            <Button
              onClick={() => setHistoryModalOpen(true)}
              variant="outline"
              className="border-gray-700 text-white hover:bg-[#4C856F] hover:border-[#4C856F]"
            >
              <Plus className="h-4 w-4 mr-2" />
              Open Wallet History
            </Button>
          </div>
        </CardContent>
      </Card>

      {userId && (
        <WalletHistoryModal
          open={historyModalOpen}
          onOpenChange={setHistoryModalOpen}
          userId={userId}
          onSwitchWallet={handleSwitchWallet}
        />
      )}
    </div>
  );
}

