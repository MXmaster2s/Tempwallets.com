"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Loader2, Wallet, Trash2, ArrowRightLeft, Clock } from "lucide-react";
import { walletApi, WalletHistoryEntry } from "@/lib/api";
import { walletStorage } from "@/lib/walletStorage";

interface WalletHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSwitchWallet: () => Promise<void>;
}

export function WalletHistoryModal({
  open,
  onOpenChange,
  userId,
  onSwitchWallet,
}: WalletHistoryModalProps) {
  const [wallets, setWallets] = useState<WalletHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load wallet history when modal opens
  useEffect(() => {
    if (open && userId) {
      loadWalletHistory();
    }
  }, [open, userId]);

  const loadWalletHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await walletApi.getWalletHistory();
      setWallets(response.wallets || []);
    } catch (err) {
      console.error('Failed to load wallet history:', err);
      setError('Failed to load wallet history');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchWallet = async (walletId: string) => {
    setSwitching(walletId);
    setError(null);
    try {
      await walletApi.switchWallet(walletId);
      // Clear local cache to force refresh
      walletStorage.clearAddresses();
      // Notify parent to reload wallets
      await onSwitchWallet();
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to switch wallet:', err);
      setError('Failed to switch wallet');
    } finally {
      setSwitching(null);
    }
  };

  const handleDeleteWallet = async (walletId: string) => {
    if (!confirm('Are you sure you want to delete this wallet from history? This action cannot be undone.')) {
      return;
    }

    setDeleting(walletId);
    setError(null);
    try {
      await walletApi.deleteWalletHistory(walletId);
      // Reload list after deletion
      await loadWalletHistory();
    } catch (err) {
      console.error('Failed to delete wallet:', err);
      setError('Failed to delete wallet');
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1a1a1a] border-gray-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Wallet History
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            View and switch between your previous wallets
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
              <span className="ml-2 text-gray-400">Loading wallet history...</span>
            </div>
          ) : error ? (
            <div className="text-red-400 text-center py-4">{error}</div>
          ) : wallets.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No wallet history yet</p>
              <p className="text-sm mt-1 opacity-75">
                Previous wallets will appear here when you create new ones
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {wallets.map((wallet) => (
                <div
                  key={wallet.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    wallet.isActive
                      ? 'bg-[#4C856F]/20 border-[#4C856F]'
                      : 'bg-[#292929] border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span className="text-white font-medium truncate">
                          {wallet.label || 'Unnamed Wallet'}
                        </span>
                        {wallet.isActive && (
                          <span className="text-xs bg-[#4C856F] text-white px-2 py-0.5 rounded-full">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Created: {formatDate(wallet.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 ml-3">
                      {!wallet.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSwitchWallet(wallet.id)}
                          disabled={switching === wallet.id}
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                        >
                          {switching === wallet.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ArrowRightLeft className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteWallet(wallet.id)}
                        disabled={deleting === wallet.id || wallet.isActive}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 disabled:opacity-30"
                        title={wallet.isActive ? "Can't delete active wallet" : "Delete wallet"}
                      >
                        {deleting === wallet.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
