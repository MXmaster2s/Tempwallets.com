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
import { Loader2, ArrowRightLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { lightningNodeApi, LightningNode, LightningNodeParticipant, walletApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface TransferFundsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lightningNode: LightningNode;
  onTransferComplete?: () => void;
}

export function TransferFundsModal({
  open,
  onOpenChange,
  lightningNode,
  onTransferComplete,
}: TransferFundsModalProps) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [userAddressSet, setUserAddressSet] = useState<Set<string>>(new Set());

  // Form state
  const [selectedRecipient, setSelectedRecipient] = useState<string>('');
  const [amount, setAmount] = useState('');

  // Load user's wallet addresses so we can match the participant row correctly.
  useEffect(() => {
    let cancelled = false;
    if (!userId) return;

    (async () => {
      try {
        const payload = await walletApi.getAddresses(userId);
        const addressSet = new Set<string>();

        const push = (addr: string | null | undefined) => {
          if (!addr) return;
          addressSet.add(addr.toLowerCase());
        };

        push(payload.smartAccount?.address);
        Object.values(payload.smartAccount?.chains || {}).forEach(push);
        (payload.auxiliary || []).forEach((w) => push(w.address));

        if (!cancelled) setUserAddressSet(addressSet);
      } catch {
        if (!cancelled) setUserAddressSet(new Set());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Get current user's participant data
  const currentParticipant = lightningNode.participants.find(
    (p) => userAddressSet.has(p.address.toLowerCase())
  );
  const otherParticipants = lightningNode.participants.filter(
    (p) => !userAddressSet.has(p.address.toLowerCase())
  );

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setSelectedRecipient('');
        setAmount('');
        setError(null);
        setSuccess(false);
      }, 300);
    }
  }, [open]);

  const handleTransfer = async () => {
    setError(null);

    // Validation
    if (!selectedRecipient) {
      setError('Please select a recipient');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (!currentParticipant) {
      setError('You are not a participant in this Lightning Node');
      return;
    }

    // Check if user has sufficient balance
    const amountInSmallestUnits = (parseFloat(amount) * 1e6).toString(); // Assuming 6 decimals
    if (BigInt(amountInSmallestUnits) > BigInt(currentParticipant.balance)) {
      setError('Insufficient balance');
      return;
    }

    if (!userId) {
      setError('User ID not found');
      return;
    }

    setLoading(true);

    try {
      const response = await lightningNodeApi.transferFunds({
        userId,
        appSessionId: lightningNode.appSessionId,
        fromAddress: currentParticipant.address,
        toAddress: selectedRecipient,
        amount: amountInSmallestUnits,
        asset: lightningNode.token,
      });

      if (response.ok) {
        setSuccess(true);

        // Notify parent to refresh data
        if (onTransferComplete) {
          onTransferComplete();
        }

        // Close modal after 1.5 seconds
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      } else {
        setError('Transfer failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setLoading(false);
    }
  };

  const currentBalance = currentParticipant
    ? (Number(currentParticipant.balance) / 1e6).toFixed(2)
    : '0.00';

  const selectedRecipientData = lightningNode.participants.find(
    p => p.address === selectedRecipient
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] bg-white text-gray-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            Transfer Funds
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Send funds instantly to another participant in this Lightning Node. Off-chain transfers
            are instant and gasless.
          </DialogDescription>
        </DialogHeader>

        {!success ? (
          <div className="space-y-4 mt-4">
            {/* Current Balance */}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <p className="text-xs text-blue-700 mb-1">Your Balance</p>
              <p className="text-2xl font-rubik-medium text-blue-900">
                {currentBalance} {lightningNode.token}
              </p>
            </div>

            {/* Recipient Selector */}
            <div className="space-y-2">
              <Label htmlFor="recipient" className="text-gray-700">
                Recipient
              </Label>
              <Select value={selectedRecipient} onValueChange={setSelectedRecipient}>
                <SelectTrigger id="recipient" className="bg-white border-gray-300 text-gray-900">
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent className="bg-white text-gray-900">
                  {otherParticipants.map(participant => (
                    <SelectItem key={participant.address} value={participant.address}>
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-mono text-xs">
                          {participant.address.slice(0, 6)}...{participant.address.slice(-4)}
                        </span>
                        <span className="text-xs text-gray-500">
                          Balance: {(Number(participant.balance) / 1e6).toFixed(2)}{' '}
                          {lightningNode.token}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRecipientData && (
                <p className="text-xs text-gray-500">
                  Current balance:{' '}
                  {(Number(selectedRecipientData.balance) / 1e6).toFixed(2)}{' '}
                  {lightningNode.token}
                </p>
              )}
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-gray-700">
                Amount
              </Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                step="0.01"
                min="0"
                max={currentBalance}
                className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
              />
              <p className="text-xs text-gray-500">
                Available: {currentBalance} {lightningNode.token}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Info Message */}
            <div className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-3 rounded-lg text-xs">
              <strong>Note:</strong> Transfers within a Lightning Node are instant and completely
              off-chain. No gas fees required!
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-8">
            <div className="flex items-center justify-center text-green-600">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <p className="text-center font-medium text-gray-900">Transfer Successful!</p>
            <p className="text-center text-sm text-gray-600">
              {amount} {lightningNode.token} transferred instantly
            </p>
          </div>
        )}

        <DialogFooter>
          {!success && (
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
                onClick={handleTransfer}
                disabled={loading || !selectedRecipient || !amount}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Transferring...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    Transfer
                  </>
                )}
              </Button>
            </>
          )}
          {success && (
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full bg-black hover:bg-gray-800 text-white"
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
