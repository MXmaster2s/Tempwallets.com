'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@repo/ui/components/ui/dialog';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui/components/ui/select';
import { Label } from '@repo/ui/components/ui/label';
import { Loader2, Wallet, CheckCircle2, AlertCircle, ArrowRight, Check } from 'lucide-react';
import { lightningNodeApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

// Progress steps for the funding flow
type FundingStep = 'idle' | 'approving' | 'depositing' | 'creating' | 'resizing' | 'complete' | 'error';

const STEP_LABELS: Record<FundingStep, string> = {
  idle: 'Ready',
  approving: 'Approving tokens...',
  depositing: 'Depositing to custody...',
  creating: 'Creating channel...',
  resizing: 'Moving to unified balance...',
  complete: 'Complete!',
  error: 'Failed',
};

interface FundChannelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chain?: string;
  asset?: string;
  onFundComplete?: () => void;
}

export function FundChannelModal({
  open,
  onOpenChange,
  chain,
  asset,
  onFundComplete,
}: FundChannelModalProps) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentStep, setCurrentStep] = useState<FundingStep>('idle');

  // Form state
  const [amount, setAmount] = useState('');
  const [selectedChain, setSelectedChain] = useState(chain || 'base');
  const [selectedAsset, setSelectedAsset] = useState(asset || 'usdc');

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setAmount('');
        setError(null);
        setSuccess(false);
        setCurrentStep('idle');
        setSelectedChain(chain || 'base');
        setSelectedAsset(asset || 'usdc');
      }, 300);
    }
  }, [open, chain, asset]);

  // Simulate step progression based on loading state
  // In reality, the backend handles all steps - we show progress for UX
  useEffect(() => {
    if (!loading) return;

    const steps: FundingStep[] = ['approving', 'depositing', 'creating', 'resizing'];
    let stepIndex = 0;

    // Progress through steps every 3 seconds (average time per step)
    const interval = setInterval(() => {
      if (stepIndex < steps.length) {
        setCurrentStep(steps[stepIndex]!);
        stepIndex++;
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [loading]);

  const handleFund = async () => {
    setError(null);
    setCurrentStep('idle');

    // Validation
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!userId) {
      setError('User ID not found');
      return;
    }

    setLoading(true);
    setCurrentStep('approving');

    try {
      const response = await lightningNodeApi.fundChannel({
        userId,
        chain: selectedChain,
        asset: selectedAsset,
        amount,
      });

      if (response.ok) {
        setCurrentStep('complete');
        setSuccess(true);

        // Notify parent to refresh data
        if (onFundComplete) {
          onFundComplete();
        }

        // Close modal after 2 seconds
        setTimeout(() => {
          onOpenChange(false);
        }, 2000);
      } else {
        setCurrentStep('error');
        setError('Failed to fund channel. Please try again.');
      }
    } catch (err) {
      setCurrentStep('error');
      const errorMsg = err instanceof Error ? err.message : 'Failed to fund channel';

      // Provide more helpful error messages
      if (errorMsg.includes('insufficient') || errorMsg.includes('balance')) {
        setError(`Insufficient ${selectedAsset.toUpperCase()} balance. Please ensure you have enough tokens in your wallet.`);
      } else if (errorMsg.includes('allowance') || errorMsg.includes('approve')) {
        setError('Token approval failed. Please try again or check your wallet.');
      } else if (errorMsg.includes('revert')) {
        setError('Transaction failed. This may be due to insufficient gas or network issues.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Step indicator component
  const StepIndicator = () => {
    const steps = [
      { key: 'approving', label: 'Approve' },
      { key: 'depositing', label: 'Deposit' },
      { key: 'creating', label: 'Create' },
      { key: 'resizing', label: 'Finalize' },
    ];

    const stepOrder = ['approving', 'depositing', 'creating', 'resizing', 'complete'];
    const currentIndex = stepOrder.indexOf(currentStep);

    return (
      <div className="flex items-center justify-between mb-4">
        {steps.map((step, index) => {
          const isComplete = currentIndex > index || currentStep === 'complete';
          const isCurrent = stepOrder[index] === currentStep;
          const isPending = currentIndex < index;

          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    isComplete
                      ? 'bg-green-500 text-white'
                      : isCurrent
                      ? 'bg-blue-500 text-white animate-pulse'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span
                  className={`text-[10px] mt-1 ${
                    isComplete || isCurrent ? 'text-gray-900' : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-8 h-0.5 mx-1 ${
                    currentIndex > index ? 'bg-green-500' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add to Unified Balance</DialogTitle>
          <DialogDescription>
            Move funds from your wallet to Yellow Network. This enables gasless Lightning Node operations.
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator when loading */}
        {loading && <StepIndicator />}

        {/* Current step status */}
        {loading && currentStep !== 'idle' && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
            <span>{STEP_LABELS[currentStep]}</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Transaction Failed</p>
              <p className="text-xs mt-1">{error}</p>
            </div>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>Funds added to unified balance successfully!</span>
          </div>
        )}

        {!success && !loading && (
          <div className="space-y-4 py-4">
            {/* Flow explanation */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <p className="text-xs text-gray-600 mb-2 font-medium">What happens:</p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="bg-white px-2 py-1 rounded border">Approve</span>
                <ArrowRight className="h-3 w-3" />
                <span className="bg-white px-2 py-1 rounded border">Deposit</span>
                <ArrowRight className="h-3 w-3" />
                <span className="bg-white px-2 py-1 rounded border">Create</span>
                <ArrowRight className="h-3 w-3" />
                <span className="bg-white px-2 py-1 rounded border">Done</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chain">Chain</Label>
              <Select value={selectedChain} onValueChange={setSelectedChain} disabled={loading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Base</SelectItem>
                  <SelectItem value="arbitrum">Arbitrum</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="asset">Asset</Label>
              <Select value={selectedAsset} onValueChange={setSelectedAsset} disabled={loading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="usdc">USDC</SelectItem>
                  <SelectItem value="usdt">USDT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount ({selectedAsset.toUpperCase()})</Label>
              <Input
                id="amount"
                type="number"
                step="0.000001"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                className="text-lg"
              />
              <p className="text-xs text-gray-500">
                Requires on-chain transaction. After this, all Lightning Node operations are gasless.
              </p>
            </div>
          </div>
        )}

        {loading && !success && (
          <div className="py-6">
            <p className="text-sm text-gray-600 text-center">
              Please wait while we process your transaction. This may take a few minutes.
            </p>
            <p className="text-xs text-gray-400 text-center mt-2">
              Do not close this window.
            </p>
          </div>
        )}

        {success && (
          <div className="py-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm text-gray-600">
                Your funds are now in the unified balance.
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Deposit to Lightning Nodes without gas fees!
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {!success && !loading && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                className="text-gray-900 border-gray-300"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleFund}
                disabled={loading || !amount || parseFloat(amount) <= 0}
                className="bg-black hover:bg-gray-800 text-white"
              >
                <Wallet className="mr-2 h-4 w-4" />
                Add to Balance
              </Button>
            </>
          )}
          {loading && !success && (
            <Button
              type="button"
              variant="outline"
              disabled
              className="w-full"
            >
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing... Do not close
            </Button>
          )}
          {success && (
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full bg-black hover:bg-gray-800 text-white"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

