"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Label } from "@repo/ui/components/ui/label";
import {
  Loader2,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ExternalLink,
  Info,
} from "lucide-react";
import { custodyApi } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface CustodyDepositModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chain?: string;
  asset?: string;
  onDepositComplete?: (unifiedBalance: string) => void;
}

type DepositStep =
  | "input"
  | "approving"
  | "depositing"
  | "indexing"
  | "success"
  | "error";

export function CustodyDepositModal({
  open,
  onOpenChange,
  chain,
  asset,
  onDepositComplete,
}: CustodyDepositModalProps) {
  const { userId } = useAuth();
  const [step, setStep] = useState<DepositStep>("input");
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState("");
  const [selectedChain, setSelectedChain] = useState(chain || "base");
  const [selectedAsset, setSelectedAsset] = useState(asset || "usdc");

  // Result state
  const [approveTxHash, setApproveTxHash] = useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [unifiedBalance, setUnifiedBalance] = useState<string | null>(null);

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setAmount("");
        setError(null);
        setStep("input");
        setSelectedChain(chain || "base");
        setSelectedAsset(asset || "usdc");
        setApproveTxHash(null);
        setDepositTxHash(null);
        setUnifiedBalance(null);
      }, 300);
    }
  }, [open, chain, asset]);

  const getExplorerUrl = (txHash: string) => {
    const explorers: Record<string, string> = {
      base: "https://basescan.org/tx/",
      arbitrum: "https://arbiscan.io/tx/",
      ethereum: "https://etherscan.io/tx/",
    };
    return `${explorers[selectedChain] || explorers.base}${txHash}`;
  };

  const handleDeposit = async () => {
    setError(null);

    // Validation
    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (!userId) {
      setError("User ID not found. Please refresh the page.");
      return;
    }

    try {
      // Step 1: Approving
      setStep("approving");

      const response = await custodyApi.depositToCustody({
        userId,
        chain: selectedChain,
        asset: selectedAsset,
        amount,
      });

      if (response.ok && response.data.success) {
        setApproveTxHash(response.data.approveTxHash);
        setDepositTxHash(response.data.depositTxHash);
        // The deposit endpoint currently returns whatever the backend thinks the unified
        // balance is at that moment. Yellow indexing may lag, so we do an explicit query
        // after the on-chain operations complete.
        setStep("indexing");

        let latestUnifiedBalance = response.data.unifiedBalance;
        try {
          const latest = await custodyApi.getUnifiedBalance({
            userId,
            chain: selectedChain,
          });
          const entry = latest.data.balances.find(
            (b) => b.asset.toLowerCase() === selectedAsset.toLowerCase(),
          );
          if (entry) {
            latestUnifiedBalance = entry.amount;
          }
        } catch {
          // If the query fails, fall back to the response value.
        }

        setUnifiedBalance(latestUnifiedBalance);
        setStep("success");

        // Notify parent to refresh data
        if (onDepositComplete) {
          onDepositComplete(latestUnifiedBalance);
        }
      } else {
        throw new Error("Deposit failed. Please try again.");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to deposit to custody";
      setError(errorMessage);
      setStep("error");
    }
  };

  const formatUnifiedBalance = (balance: string | null) => {
    if (!balance) return "0.00";
    // Balance is in smallest units (6 decimals for USDC/USDT)
    const value = parseFloat(balance) / 1e6;
    return value.toFixed(2);
  };

  const renderStepContent = () => {
    switch (step) {
      case "input":
        return (
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">On-Chain Deposit</p>
                  <p className="text-xs text-blue-700">
                    This will transfer funds from your wallet to Yellow Network
                    custody. Your unified balance will be credited after the
                    transaction confirms.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chain">Chain</Label>
              <Select value={selectedChain} onValueChange={setSelectedChain}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Base</SelectItem>
                  <SelectItem value="arbitrum">Arbitrum</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Select the blockchain network
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset">Asset</Label>
              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usdc">USDC</SelectItem>
                  <SelectItem value="usdt">USDT</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Select the token to deposit
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">
                Amount ({selectedAsset.toUpperCase()})
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.000001"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="text-lg"
              />
              <p className="text-xs text-gray-500">
                This amount will be deposited to custody and credited to your
                unified balance
              </p>
            </div>
          </div>
        );

      case "approving":
        return (
          <div className="py-8 flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
            </div>
            <div className="text-center">
              <p className="font-rubik-medium text-gray-900">
                Approving Token...
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Step 1/3: Approving {selectedAsset.toUpperCase()} for custody
                contract
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Please wait for the transaction to confirm
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                Approve
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                Deposit
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                Index
              </span>
            </div>
          </div>
        );

      case "depositing":
        return (
          <div className="py-8 flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
            </div>
            <div className="text-center">
              <p className="font-rubik-medium text-gray-900">
                Depositing to Custody...
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Step 2/3: Transferring {amount} {selectedAsset.toUpperCase()} to
                custody
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">
                ✓ Approve
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                Deposit
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                Index
              </span>
            </div>
          </div>
        );

      case "indexing":
        return (
          <div className="py-8 flex flex-col items-center justify-center space-y-4">
            <div className="relative">
              <Loader2 className="h-12 w-12 animate-spin text-purple-600" />
            </div>
            <div className="text-center">
              <p className="font-rubik-medium text-gray-900">
                Crediting Unified Balance...
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Step 3/3: Yellow Network is indexing your deposit
              </p>
              <p className="text-xs text-gray-400 mt-2">
                This may take up to 30 seconds
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">
                ✓ Approve
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">
                ✓ Deposit
              </span>
              <ArrowRight className="h-3 w-3" />
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                Index
              </span>
            </div>
          </div>
        );

      case "success":
        return (
          <div className="py-6 space-y-4">
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-rubik-medium text-gray-900 text-lg">
                  Deposit Successful!
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Your unified balance has been credited
                </p>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Amount Deposited</span>
                <span className="font-rubik-medium text-gray-900">
                  {amount} {selectedAsset.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Unified Balance</span>
                <span className="font-rubik-medium text-green-600">
                  {formatUnifiedBalance(unifiedBalance)}{" "}
                  {selectedAsset.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Transaction Links */}
            <div className="space-y-2">
              {approveTxHash && (
                <a
                  href={getExplorerUrl(approveTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm text-gray-600">
                    Approval Transaction
                  </span>
                  <div className="flex items-center gap-1 text-sm text-purple-600">
                    <span className="font-mono">
                      {approveTxHash.slice(0, 6)}...{approveTxHash.slice(-4)}
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </div>
                </a>
              )}
              {depositTxHash && (
                <a
                  href={getExplorerUrl(depositTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm text-gray-600">
                    Deposit Transaction
                  </span>
                  <div className="flex items-center gap-1 text-sm text-purple-600">
                    <span className="font-mono">
                      {depositTxHash.slice(0, 6)}...{depositTxHash.slice(-4)}
                    </span>
                    <ExternalLink className="h-3 w-3" />
                  </div>
                </a>
              )}
            </div>

            <p className="text-sm text-gray-600 text-center">
              You can now fund channels and create app sessions using your
              unified balance!
            </p>
          </div>
        );

      case "error":
        return (
          <div className="py-6 space-y-4">
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <div className="text-center">
                <p className="font-rubik-medium text-gray-900 text-lg">
                  Deposit Failed
                </p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-medium mb-1">What went wrong?</p>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>
                  Make sure you have enough {selectedAsset.toUpperCase()} in
                  your wallet
                </li>
                <li>Ensure you have enough native token for gas fees</li>
                <li>Check that the custody contract is available</li>
              </ul>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderFooter = () => {
    switch (step) {
      case "input":
        return (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-gray-900 border-gray-300"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDeposit}
              disabled={!amount || parseFloat(amount) <= 0}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Wallet className="mr-2 h-4 w-4" />
              Deposit to Custody
            </Button>
          </>
        );

      case "approving":
      case "depositing":
      case "indexing":
        return (
          <Button
            type="button"
            variant="outline"
            disabled
            className="w-full text-gray-500"
          >
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </Button>
        );

      case "success":
        return (
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full bg-black hover:bg-gray-800 text-white"
          >
            Done
          </Button>
        );

      case "error":
        return (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="text-gray-900 border-gray-300"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => setStep("input")}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Try Again
            </Button>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {step === "success"
              ? "Deposit Complete"
              : "Add Funds to Unified Balance"}
          </DialogTitle>
          {step === "input" && (
            <DialogDescription>
              Deposit funds from your on-chain wallet to Yellow Network custody.
              This credits your unified balance for Lightning Node operations.
            </DialogDescription>
          )}
        </DialogHeader>

        {renderStepContent()}

        <DialogFooter className="gap-2 sm:gap-0">{renderFooter()}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
