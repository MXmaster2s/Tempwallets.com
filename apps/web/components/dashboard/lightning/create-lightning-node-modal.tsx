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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/ui/components/ui/tabs';
import { Loader2, CheckCircle2, Zap, Copy, ScanLine } from 'lucide-react';
import { useLightningNodes } from '@/hooks/lightning-nodes-context';
import { LightningNode } from '@/lib/api';
import { QRCodeCanvas } from 'qrcode.react';

interface CreateLightningNodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined?: (node: LightningNode) => void; // optional callback to surface joined node to parent
}

const SUPPORTED_CHAINS = [
  { id: 'ethereumErc4337', name: 'Ethereum Gasless' },
  { id: 'baseErc4337', name: 'Base Gasless' },
  { id: 'arbitrumErc4337', name: 'Arbitrum' },
  { id: 'polygonErc4337', name: 'Polygon' },
];

const SUPPORTED_TOKENS = ['USDC', 'USDT'];

// Address validation for EVM addresses
const validateEvmAddress = (address: string): string | null => {
  if (!address || address.trim().length === 0) {
    return null; // Optional field
  }
  const trimmed = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return 'Invalid Ethereum address format (must start with 0x and be 42 characters)';
  }
  return null;
};

export function CreateLightningNodeModal({ open, onOpenChange, onJoined }: CreateLightningNodeModalProps) {
  const { createNode, joinNode, loading } = useLightningNodes();
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [showJoinForm, setShowJoinForm] = useState(true);

  // Create form state
  const [selectedChain, setSelectedChain] = useState('ethereumErc4337');
  const [selectedToken, setSelectedToken] = useState('USDC');
  const [participantAddresses, setParticipantAddresses] = useState<string>('');
  const [addressError, setAddressError] = useState<string | null>(null);

  // Join form state
  const [joinUri, setJoinUri] = useState('');

  // Joined node details
  const [joinedNode, setJoinedNode] = useState<LightningNode | null>(null);

  // Result state
  const [createdNode, setCreatedNode] = useState<LightningNode | null>(null);
  const [copiedUri, setCopiedUri] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetToStart = (tab: 'create' | 'join' = 'create') => {
    setActiveTab(tab);
    setShowJoinForm(true);
    setSelectedChain('ethereumErc4337');
    setSelectedToken('USDC');
    setParticipantAddresses('');
    setJoinUri('');
    setCreatedNode(null);
    setJoinedNode(null);
    setError(null);
    setSuccess(false);
    setAddressError(null);
    setCopiedUri(false);
    setCopiedSessionId(false);
  };

  // Reset form when modal closes
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        resetToStart('create');
      }, 300);
    }
  }, [open]);

  // Validate addresses on change
  useEffect(() => {
    if (participantAddresses.trim()) {
      const addresses = participantAddresses.split(',').map(a => a.trim()).filter(a => a);
      for (const addr of addresses) {
        const error = validateEvmAddress(addr);
        if (error) {
          setAddressError(`Invalid address: ${addr}`);
          return;
        }
      }
      setAddressError(null);
    } else {
      // No addresses is fine - user can create solo Lightning Node
      setAddressError(null);
    }
  }, [participantAddresses]);

  const handleCreateNode = async () => {
    setError(null);

    // Parse and validate participant addresses (optional)
    const addresses = participantAddresses.split(',').map(a => a.trim()).filter(a => a);

    // Validate each address if any provided
    for (const addr of addresses) {
      const addrError = validateEvmAddress(addr);
      if (addrError) {
        setError(`Invalid address: ${addr}`);
        return;
      }
    }

    // Validate chain
    if (!selectedChain) {
      setError('Please select a chain');
      return;
    }

    try {
      const node = await createNode({
        participants: addresses.length > 0 ? addresses : undefined,
        token: selectedToken,
        chain: selectedChain,
      });

      if (node) {
        setCreatedNode(node);
        setSuccess(true);
      } else {
        setError('Failed to create Lightning Node');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Lightning Node');
    }
  };

  const handleJoinNode = async () => {
    setError(null);

    if (!joinUri || joinUri.trim().length === 0) {
      setError('Please enter a Lightning Node URI');
      return;
    }

    try {
      const node = await joinNode(joinUri.trim());

      if (node) {
        setJoinedNode(node);
        setSuccess(true);

        // Parent can choose to navigate; we keep the success view visible until user clicks.
        if (onJoined) {
          onJoined(node);
        }
      } else {
        setError('Failed to join Lightning Node');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join Lightning Node');
    }
  };

  const handleCopyUri = () => {
    const uriToCopy = createdNode?.uri || joinedNode?.uri;
    if (uriToCopy) {
      navigator.clipboard.writeText(uriToCopy);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-white text-gray-900 max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900">
            <Zap className="h-5 w-5 text-gray-700" />
            Lightning Node
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Create or join a Lightning Node (Yellow Network Nitrolite Channel) for instant, low-cost
            off-chain transactions.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto pr-1">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'create' | 'join')}>
            <TabsList className="grid w-full grid-cols-2 bg-gray-100">
              <TabsTrigger
                value="create"
                className="data-[state=active]:bg-white data-[state=active]:text-gray-900 text-gray-600"
              >
                Create
              </TabsTrigger>
              <TabsTrigger
                value="join"
                className="data-[state=active]:bg-white data-[state=active]:text-gray-900 text-gray-600"
              >
                Join
              </TabsTrigger>
            </TabsList>

            {/* Create Tab */}
            <TabsContent value="create" className="space-y-4 mt-4 min-h-[300px]">
              {!createdNode ? (
                <>
                  {/* Chain Selector */}
                  <div className="space-y-2">
                    <Label htmlFor="chain" className="text-gray-700">
                      Chain
                    </Label>
                    <Select value={selectedChain} onValueChange={setSelectedChain}>
                      <SelectTrigger id="chain" className="bg-white border-gray-300 text-gray-900">
                        <SelectValue placeholder="Select chain" />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-gray-900">
                        {SUPPORTED_CHAINS.map((chain) => (
                          <SelectItem key={chain.id} value={chain.id} className="text-gray-900">
                            {chain.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Token Selector */}
                  <div className="space-y-2">
                    <Label htmlFor="token" className="text-gray-700">
                      Token
                    </Label>
                    <Select value={selectedToken} onValueChange={setSelectedToken}>
                      <SelectTrigger id="token" className="bg-white border-gray-300 text-gray-900">
                        <SelectValue placeholder="Select token" />
                      </SelectTrigger>
                      <SelectContent className="bg-white text-gray-900">
                        {SUPPORTED_TOKENS.map((token) => (
                          <SelectItem key={token} value={token} className="text-gray-900">
                            {token}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Participant Addresses (Optional) */}
                  <div className="space-y-2">
                    <Label htmlFor="participants" className="text-gray-700">
                      Participant Addresses (Optional)
                    </Label>
                    <Input
                      id="participants"
                      type="text"
                      placeholder="0x123..., 0x456..., 0x789... (optional)"
                      value={participantAddresses}
                      onChange={(e) => setParticipantAddresses(e.target.value)}
                      className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
                    />
                    {addressError && <p className="text-xs text-red-500">{addressError}</p>}
                    <p className="text-xs text-gray-500">
                      Invite-only: Enter wallet addresses separated by commas. Only these addresses will be able to join this
                      Lightning Node.
                    </p>
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center text-gray-700 mb-2">
                    <CheckCircle2 className="h-12 w-12" />
                  </div>
                  <p className="text-center font-medium text-gray-900">Lightning Node Created!</p>
                  <p className="text-center text-sm text-gray-600">
                    Share this QR code or URI with others to join the channel. Max {createdNode.maxParticipants} participants.
                  </p>

                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-xl border-2 border-gray-200">
                      <QRCodeCanvas value={createdNode.uri} size={192} level="H" />
                    </div>
                  </div>

                  {createdNode.appSessionId && (
                    <div className="bg-white rounded-xl border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">Session ID</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(createdNode.appSessionId!);
                            setCopiedSessionId(true);
                            setTimeout(() => setCopiedSessionId(false), 2000);
                          }}
                          className="text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedSessionId ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-gray-700 break-all">{createdNode.appSessionId}</p>
                    </div>
                  )}

                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-700 font-medium text-sm">Lightning Node URI</span>
                      <button
                        onClick={handleCopyUri}
                        className="text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedUri ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs font-mono text-gray-700 break-all">{createdNode.uri}</p>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-gray-900 border-gray-300"
                      onClick={() => resetToStart('create')}
                    >
                      Create another
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-gray-900 border-gray-300"
                      onClick={() => resetToStart('join')}
                    >
                      Join a node
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-gray-900 border-gray-300"
                      onClick={handleClose}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Join Tab */}
            <TabsContent value="join" className="space-y-4 mt-4 min-h-[300px]">
              {!success ? (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-gray-500" />
                      <p className="text-sm text-gray-800 font-medium">Join via URI / Session</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowJoinForm((v) => !v)}
                      className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-800 hover:bg-gray-100"
                    >
                      {showJoinForm ? 'Hide' : 'Show'}
                    </button>
                  </div>

                  {showJoinForm && (
                    <div className="space-y-3 rounded-xl border border-gray-200 p-3 bg-white">
                      <div className="space-y-2">
                        <Label htmlFor="join-uri" className="text-gray-700">
                          Lightning Node URI
                        </Label>
                        <Input
                          id="join-uri"
                          type="text"
                          placeholder="lightning:..."
                          value={joinUri}
                          onChange={(e) => setJoinUri(e.target.value)}
                          className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"
                        />
                        <p className="text-xs text-gray-500">Paste the URI you received or scan a QR code</p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="w-full text-gray-900 border-gray-300"
                        onClick={() => {
                          // TODO: Implement QR scanner
                          alert('QR Scanner coming soon! Please paste the URI manually for now.');
                        }}
                      >
                        <ScanLine className="h-4 w-4 mr-2" />
                        Scan QR Code
                      </Button>
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center text-gray-700 mb-2">
                    <CheckCircle2 className="h-12 w-12" />
                  </div>
                  <p className="text-center font-medium text-gray-900">Lightning Node Joined!</p>
                  <p className="text-center text-sm text-gray-600">
                    You can share the URI/QR to invite others, or open the node to manage participants and transfers.
                  </p>

                  {joinedNode && (
                    <>
                      <div className="flex justify-center">
                        <div className="bg-white p-4 rounded-xl border-2 border-gray-200">
                          <QRCodeCanvas value={joinedNode.uri} size={192} level="H" />
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-500">Session ID</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(joinedNode.appSessionId);
                              setCopiedSessionId(true);
                              setTimeout(() => setCopiedSessionId(false), 2000);
                            }}
                            className="text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1"
                          >
                            <Copy className="h-3 w-3" />
                            {copiedSessionId ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs font-mono text-gray-700 break-all">{joinedNode.appSessionId}</p>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-gray-700 font-medium text-sm">Lightning Node URI</span>
                          <button
                            onClick={handleCopyUri}
                            className="text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1"
                          >
                            <Copy className="h-3 w-3" />
                            {copiedUri ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs font-mono text-gray-700 break-all">{joinedNode.uri}</p>
                      </div>

                      <div className="bg-gray-50 border border-gray-200 text-gray-700 px-4 py-3 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span>Chain</span>
                          <span className="font-medium">{joinedNode.chain}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Token</span>
                          <span className="font-medium">{joinedNode.token}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Status</span>
                          <span className="font-medium">{joinedNode.status}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Max participants</span>
                          <span className="font-medium">{joinedNode.maxParticipants}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Quorum</span>
                          <span className="font-medium">{joinedNode.quorum}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Protocol</span>
                          <span className="font-medium">{joinedNode.protocol}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Challenge</span>
                          <span className="font-medium">{joinedNode.challenge}</span>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            Participants ({joinedNode.participants.length}/{joinedNode.maxParticipants})
                          </span>
                        </div>
                        <div className="mt-2 space-y-2 max-h-32 overflow-auto">
                          {joinedNode.participants.length === 0 ? (
                            <p className="text-xs text-gray-500">No participants found.</p>
                          ) : (
                            joinedNode.participants.map((p) => (
                              <div key={p.id} className="flex items-center justify-between gap-2">
                                <span className="text-xs font-mono text-gray-700 break-all">{p.address}</span>
                                <span className="text-xs text-gray-500 whitespace-nowrap">{p.weight}%</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-1">
                        {onJoined && (
                          <Button
                            type="button"
                            className="w-full bg-black hover:bg-gray-800 text-white"
                            onClick={() => {
                              onJoined(joinedNode);
                              onOpenChange(false);
                            }}
                          >
                            Open Lightning Node
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full text-gray-900 border-gray-300"
                          onClick={() => resetToStart('join')}
                        >
                          Join another
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full text-gray-900 border-gray-300"
                          onClick={() => resetToStart('create')}
                        >
                          Create a new node
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full text-gray-900 border-gray-300"
                          onClick={handleClose}
                        >
                          Close
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          {activeTab === 'create' && !createdNode && (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading} className="text-gray-900 border-gray-300">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateNode}
                disabled={loading || !!addressError || !selectedChain}
                className="bg-black hover:bg-gray-800 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Create
                  </>
                )}
              </Button>
            </>
          )}

          {activeTab === 'create' && createdNode && (
            <Button type="button" onClick={handleClose} className="w-full bg-black hover:bg-gray-800 text-white">
              Done
            </Button>
          )}

          {activeTab === 'join' && !success && (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading} className="text-gray-900 border-gray-300 hover:bg-gray-50">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleJoinNode}
                disabled={loading || !joinUri.trim()}
                className="!bg-black hover:!bg-gray-800 !text-white disabled:!bg-black disabled:!opacity-100 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join'
                )}
              </Button>
            </>
          )}

          {activeTab === 'join' && success && (
            <Button
              type="button"
              onClick={handleClose}
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

