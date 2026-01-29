'use client';

import { useState } from 'react';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { Label } from '@repo/ui/components/ui/label';
import { Loader2, ArrowRightLeft, Info } from 'lucide-react';
import { lightningNodeApi } from '@/lib/api';

interface ResizeChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  chain: string;
  asset: string;
  channelId?: string; // Optional - backend fetches automatically
  custodyBalance: string;
  unifiedBalance: string;
  onSuccess?: () => void;
}

export function ResizeChannelModal({
  isOpen,
  onClose,
  userId,
  chain,
  asset,
  channelId,
  custodyBalance,
  unifiedBalance,
  onSuccess,
}: ResizeChannelModalProps) {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState<'unified' | 'custody'>('unified');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Debug log when isOpen changes
  console.log('[ResizeChannelModal] 📊 Component render:', {
    isOpen,
    userId,
    chain,
    asset,
    custodyBalance,
    unifiedBalance,
    channelId
  });

  const handleResize = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await lightningNodeApi.resizeChannel({
        userId,
        chain,
        asset,
        amount,
        destination,
      });

      setSuccess(true);
      
      setTimeout(() => {
        onSuccess?.();
        onClose();
        setSuccess(false);
        setAmount('');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to resize channel');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
      setAmount('');
      setError(null);
      setSuccess(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Resize Channel
          </DialogTitle>
          <DialogDescription>
            Move funds between Custody contract and Unified Balance
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Channel Info */}
          <div className="rounded-lg bg-muted p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Channel ID:</span>
              <span className="font-mono text-xs">
                {channelId && channelId !== 'auto-fetch'
                  ? `${channelId.slice(0, 10)}...${channelId.slice(-8)}`
                  : 'Auto-detected by backend'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Chain:</span>
              <span className="font-medium uppercase">{chain}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Asset:</span>
              <span className="font-medium uppercase">{asset}</span>
            </div>
          </div>

          {/* Balance Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground mb-1">Custody Balance</div>
              <div className="text-lg font-bold">{custodyBalance} {asset}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground mb-1">Unified Balance</div>
              <div className="text-lg font-bold">{unifiedBalance} {asset}</div>
            </div>
          </div>

          {/* Direction Selection */}
          <div className="space-y-2">
            <Label>Direction</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={destination === 'unified' ? 'default' : 'outline'}
                onClick={() => setDestination('unified')}
                disabled={isLoading}
                className="w-full"
              >
                → Unified
              </Button>
              <Button
                type="button"
                variant={destination === 'custody' ? 'default' : 'outline'}
                onClick={() => setDestination('custody')}
                disabled={isLoading}
                className="w-full"
              >
                ← Custody
              </Button>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                {destination === 'unified' 
                  ? 'Move funds from Custody to Unified Balance (for off-chain payments)'
                  : 'Move funds from Unified Balance back to Custody (to withdraw)'}
              </span>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ({asset})</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isLoading}
              step="0.000001"
              min="0"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount((parseFloat(destination === 'unified' ? custodyBalance : unifiedBalance) * 0.25).toFixed(6))}
                disabled={isLoading}
              >
                25%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount((parseFloat(destination === 'unified' ? custodyBalance : unifiedBalance) * 0.5).toFixed(6))}
                disabled={isLoading}
              >
                50%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount((parseFloat(destination === 'unified' ? custodyBalance : unifiedBalance) * 0.75).toFixed(6))}
                disabled={isLoading}
              >
                75%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount(destination === 'unified' ? custodyBalance : unifiedBalance)}
                disabled={isLoading}
              >
                MAX
              </Button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
              ✅ Channel resized successfully!
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleResize}
            disabled={isLoading || !amount || parseFloat(amount) <= 0}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resizing...
              </>
            ) : (
              <>
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Resize Channel
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
