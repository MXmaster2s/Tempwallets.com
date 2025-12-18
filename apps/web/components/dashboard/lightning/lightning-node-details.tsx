'use client';

import { useState, useEffect } from 'react';
import { Loader2, Zap, Copy, ArrowRightLeft, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@repo/ui/components/ui/button';
import { lightningNodeApi, LightningNode, LightningNodeParticipant, walletApi } from '@/lib/api';
import { TransferFundsModal } from '../modals/transfer-funds-modal';
import { useAuth } from '@/hooks/useAuth';

interface LightningNodeDetailsProps {
  lightningNodeId: string;
  onClose?: () => void;
}

const CHAIN_NAMES: Record<string, string> = {
  ethereum: 'Ethereum',
  ethereumErc4337: 'Ethereum Gasless',
  base: 'Base',
  baseErc4337: 'Base Gasless',
  arbitrum: 'Arbitrum',
  arbitrumErc4337: 'Arbitrum Gasless',
  polygon: 'Polygon',
  polygonErc4337: 'Polygon Gasless',
};

export function LightningNodeDetails({ lightningNodeId, onClose }: LightningNodeDetailsProps) {
  const { userId } = useAuth();
  const [lightningNode, setLightningNode] = useState<LightningNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userAddressSet, setUserAddressSet] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [showParticipants, setShowParticipants] = useState(true);
  const [showTransactions, setShowTransactions] = useState(false);

  // Best-effort presence heartbeat for this node.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (!userId || !lightningNode?.appSessionId) return;

    const sendHeartbeat = async () => {
      try {
        await lightningNodeApi.heartbeatLightningNode(lightningNode.appSessionId, userId);
      } catch {
        // Non-critical
      }
    };

    // Kick immediately, then every 30s while the details view is open.
    void sendHeartbeat();
    timer = setInterval(sendHeartbeat, 30_000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [userId, lightningNode?.appSessionId]);

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
        // Best-effort: if this fails, UI falls back to showing 0 balance and disables actions.
        if (!cancelled) setUserAddressSet(new Set());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Fetch Lightning Node details
  useEffect(() => {
    const fetchDetails = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await lightningNodeApi.getLightningNodeById(lightningNodeId);
        if (response.ok && response.node) {
          setLightningNode(response.node);
        } else {
          setError('Failed to load Lightning Node details');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Lightning Node details');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [lightningNodeId]);

  const handleCopySessionId = () => {
    if (lightningNode) {
      navigator.clipboard.writeText(lightningNode.appSessionId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleCopyUri = () => {
    if (lightningNode) {
      navigator.clipboard.writeText(lightningNode.uri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    }
  };

  const handleCloseNode = async () => {
    if (!lightningNode || !userId) return;

    const confirmClose = window.confirm(
      'Are you sure you want to close this Lightning Node? This will distribute all funds back to participants on-chain.'
    );

    if (!confirmClose) return;

    try {
      setLoading(true);
      const response = await lightningNodeApi.closeLightningNode({
        userId,
        appSessionId: lightningNode.appSessionId,
      });

      if (response.ok) {
        alert('Lightning Node closed successfully!');
        // Refresh details
        const updatedResponse = await lightningNodeApi.getLightningNodeById(lightningNodeId);
        if (updatedResponse.ok && updatedResponse.node) {
          setLightningNode(updatedResponse.node);
        }
      } else {
        alert('Failed to close Lightning Node');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to close Lightning Node');
    } finally {
      setLoading(false);
    }
  };

  const refreshDetails = async () => {
    try {
      const response = await lightningNodeApi.getLightningNodeById(lightningNodeId);
      if (response.ok && response.node) {
        setLightningNode(response.node);
      }
    } catch (err) {
      console.error('Failed to refresh details:', err);
    }
  };

  // Loading state
  if (loading && !lightningNode) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
        <p className="text-gray-500 font-rubik-normal">Loading Lightning Node...</p>
      </div>
    );
  }

  // Error state
  if (error && !lightningNode) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-red-500 mb-4">⚠️</div>
        <p className="text-gray-600 text-lg font-rubik-medium mb-2">Failed to load details</p>
        <p className="text-gray-500 text-sm">{error}</p>
        {onClose && (
          <Button onClick={onClose} className="mt-4" variant="outline">
            Go Back
          </Button>
        )}
      </div>
    );
  }

  if (!lightningNode) return null;

  const totalBalance = lightningNode.participants.reduce(
    (sum, p) => sum + BigInt(p.balance),
    BigInt(0)
  );
  const balanceHuman = (Number(totalBalance) / 1e6).toFixed(2);
  const participantCount = lightningNode.participants.length;
  const currentParticipant = lightningNode.participants.find(
    (p) => userAddressSet.has(p.address.toLowerCase())
  );
  const myBalance = currentParticipant ? (Number(currentParticipant.balance) / 1e6).toFixed(2) : '0.00';

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gray-100 p-3 rounded-xl">
              <Zap className="h-6 w-6 text-gray-700" />
            </div>
            <div>
              <h2 className="text-xl font-rubik-medium text-gray-900">
                {CHAIN_NAMES[lightningNode.chain] || lightningNode.chain}
              </h2>
              <p className="text-sm text-gray-500">{lightningNode.token} Lightning Node</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          )}
        </div>

        {/* Status and Balance Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-700 mb-1">My Balance</p>
            <p className="text-2xl font-rubik-medium text-gray-900">
              {myBalance} {lightningNode.token}
            </p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-700 mb-1">Total Balance</p>
            <p className="text-2xl font-rubik-medium text-gray-900">
              {balanceHuman} {lightningNode.token}
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-gray-200">
          <span className="text-sm text-gray-600">Status</span>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              lightningNode.status === 'open'
                ? 'bg-gray-200 text-gray-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {lightningNode.status === 'open' ? 'Open' : 'Closed'}
          </span>
        </div>

        {/* Session ID */}
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Session ID</p>
            <button
              onClick={handleCopySessionId}
              className="text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1"
            >
              <Copy className="h-3 w-3" />
              {copiedId ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs font-mono text-gray-700 break-all">{lightningNode.appSessionId}</p>
        </div>

        {/* Share URI (if accepting participants) */}
        {lightningNode.status === 'open' && participantCount < lightningNode.maxParticipants && (
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-700 font-medium">Share to add participants</p>
              <button
                onClick={handleCopyUri}
                className="text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1"
              >
                <Copy className="h-3 w-3" />
                {copiedUri ? 'Copied!' : 'Copy URI'}
              </button>
            </div>
            <p className="text-xs font-mono text-gray-700 break-all">{lightningNode.uri}</p>
          </div>
        )}

        {/* Action Buttons */}
        {lightningNode.status === 'open' && currentParticipant && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => setTransferModalOpen(true)}
              className="bg-gray-900 hover:bg-gray-800 text-white"
              disabled={Number(myBalance) === 0}
            >
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              Transfer
            </Button>
            <Button
              onClick={handleCloseNode}
              variant="outline"
              className="text-gray-900 border-gray-300 hover:bg-gray-100"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Close Node
            </Button>
          </div>
        )}

        {/* Participants Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <h3 className="font-rubik-medium text-gray-900">
              Participants ({participantCount}/{lightningNode.maxParticipants})
            </h3>
            {showParticipants ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </button>

          {showParticipants && (
            <div className="border-t border-gray-200">
              {lightningNode.participants.map((participant, index) => (
                <div
                  key={participant.address}
                  className={`p-4 flex items-center justify-between ${
                    index !== lightningNode.participants.length - 1 ? 'border-b border-gray-100' : ''
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm text-gray-900">
                        {participant.address.slice(0, 10)}...{participant.address.slice(-8)}
                      </p>
                      {participant.address === userId && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      Weight: {participant.weight}% |{' '}
                      {participant.status === 'invited' ? (
                        'Invited'
                      ) : participant.joinedAt ? (
                        <>Joined {new Date(participant.joinedAt).toLocaleDateString()}</>
                      ) : (
                        'Joined'
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-rubik-medium text-gray-900">
                      {(Number(participant.balance) / 1e6).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">{lightningNode.token}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transactions Section */}
        {lightningNode.transactions && lightningNode.transactions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setShowTransactions(!showTransactions)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <h3 className="font-rubik-medium text-gray-900">
                Transactions ({lightningNode.transactions.length})
              </h3>
              {showTransactions ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </button>

            {showTransactions && (
              <div className="border-t border-gray-200">
                {lightningNode.transactions.map((tx, index) => (
                  <div
                    key={tx.id}
                    className={`p-4 ${
                      index !== lightningNode.transactions!.length - 1 ? 'border-b border-gray-100' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                        {tx.type}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          tx.status === 'confirmed'
                            ? 'bg-green-100 text-green-700'
                            : tx.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-600">
                        <p className="font-mono">
                          {tx.from.slice(0, 8)}... → {tx.to.slice(0, 8)}...
                        </p>
                        <p className="text-gray-400">
                          {new Date(tx.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <p className="font-rubik-medium text-gray-900">
                        {(Number(tx.amount) / 1e6).toFixed(2)} {tx.asset}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transfer Modal */}
      {currentParticipant && (
        <TransferFundsModal
          open={transferModalOpen}
          onOpenChange={setTransferModalOpen}
          lightningNode={lightningNode}
          onTransferComplete={refreshDetails}
        />
      )}
    </>
  );
}
