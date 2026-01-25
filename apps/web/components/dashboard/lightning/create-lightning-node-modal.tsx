'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Loader2, CheckCircle2, Zap, Copy, ScanLine, HelpCircle } from 'lucide-react';
import { useLightningNodes } from '@/hooks/lightning-nodes-context';
import { LightningNode } from '@/lib/api';
import { QRCodeCanvas } from 'qrcode.react';

interface CreateLightningNodeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJoined?: (node: LightningNode) => void; // optional callback to surface joined node to parent
}

const SUPPORTED_CHAINS = [
  { id: 'base', name: 'Base' },
  { id: 'arbitrum', name: 'Arbitrum' },
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
  const { createNode, joinNode, loading, walletAddress } = useLightningNodes();
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [showJoinForm, setShowJoinForm] = useState(true);

  // Create form state
  const [selectedChain, setSelectedChain] = useState('base');
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
  const errorRef = useRef<HTMLDivElement>(null);


  const [copiedSessionId, setCopiedSessionId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const resetToStart = (tab: 'create' | 'join' = 'create') => {
    setActiveTab(tab);
    setShowJoinForm(true);
    setSelectedChain('base');
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

    // Parse and validate participant addresses (required)
    const addresses = participantAddresses.split(',').map(a => a.trim()).filter(a => a);

    if (addresses.length === 0) {
      setError('Please enter at least one temporary wallet address');
      return;
    }

    // Validate each address if any provided
    for (const addr of addresses) {
      const addrError = validateEvmAddress(addr);
      if (addrError) {
        setError(`Invalid address: ${addr}`);
        return;
      }

      // Check if user is adding themselves
      if (walletAddress && addr.toLowerCase() === walletAddress.toLowerCase()) {
        setError('Invalid Address: Please enter a different wallet address (not your own).');
        return;
      }
    }

    // Validate chain (required)
    if (!selectedChain || !SUPPORTED_CHAINS.find(c => c.id === selectedChain)) {
      setError('Please select a network (Base or Arbitrum)');
      return;
    }

    // Call API
    try {
      const node = await createNode({
        token: selectedToken,
        chain: selectedChain,
        participants: addresses,
        // Default to equal weights and majority quorum
      });

      if (node) {
        setSuccess(true);
        setCreatedNode(node);
        setShowJoinForm(false);
      }
    } catch (err) {
      const dbError = err instanceof Error ? err.message : 'Unknown error';
      // Sanitize backend error
      if (dbError.includes('require at least 1 participant')) {
        setError('Invalid Address: Please enter a different wallet address (not your own).');
      } else {
        setError(dbError);
      }
    }
  };

  const handleJoinNode = async () => {
    setError(null);

    if (!joinUri || joinUri.trim().length === 0) {
      setError('Please enter a Lightning Node URI');
      return;
    }

    // Basic format validation
    if (!joinUri.toLowerCase().startsWith('lightning://')) {
      setError('Please enter correct uri');
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
        setError('Failed to join lightning node');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '';

      if (errorMessage.includes('Invalid Lightning Node URI format')) {
        setError('Please enter correct uri');
        return;
      }

      setError('Failed to join lightning node');
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
      <DialogContent className="w-[90%] max-w-[425px] h-[520px] border-white/10 bg-black/90 text-white shadow-2xl backdrop-blur max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle className="flex items-center gap-2 text-xl font-rubik-medium text-white">
            <Zap className="h-5 w-5 text-white fill-white" />
            {activeTab === 'create' ? 'Create Lightning Node' : 'Join Lightning Node'}
            <a
              href="https://medium.com/@yellow_network"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-white/40 hover:text-white/80 transition-colors"
              title="Learn more about Lightning Nodes"
            >
              <HelpCircle className="h-4 w-4" />
            </a>
          </DialogTitle>
          <DialogDescription className="text-left text-white/60">
            {activeTab === 'create'
              ? 'Open a high-speed payment channel to experience the power of real-time, instant payments.'
              : 'Connect to an existing Lightning Node network instantly via URI.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 pb-3">
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v as 'create' | 'join');
              setError(null);
              setAddressError(null);
            }}
          >
            <TabsList className="grid w-full grid-cols-2 bg-white/5 rounded-xl p-1">
              <TabsTrigger
                value="create"
                className="rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60 transition-all"
              >
                Create
              </TabsTrigger>
              <TabsTrigger
                value="join"
                className="rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60 transition-all"
              >
                Join
              </TabsTrigger>
            </TabsList>

            {/* Create Tab */}
            <TabsContent value="create" className="space-y-4 mt-4">
              {!createdNode ? (
                <>
                  {/* Network Selector (Required) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="chain" className="text-xs font-medium text-white/80">
                      Select Network <span className="text-red-400">*</span>
                    </Label>
                    <Select value={selectedChain} onValueChange={setSelectedChain}>
                      <SelectTrigger id="chain" className="h-9 rounded-xl border-white/20 bg-white/5 text-sm text-white hover:bg-white/10">
                        <SelectValue placeholder="Select network (Base or Arbitrum)" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-white/20 bg-black/95 text-white">
                        {SUPPORTED_CHAINS.map((chain) => (
                          <SelectItem key={chain.id} value={chain.id} className="text-sm focus:bg-white/10 focus:text-white">
                            {chain.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Token (Required) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="token" className="text-xs font-medium text-white/80">
                      Select Token <span className="text-red-400">*</span>
                    </Label>
                    <Select value={selectedToken} onValueChange={setSelectedToken}>
                      <SelectTrigger id="token" className="h-9 rounded-xl border-white/20 bg-white/5 text-sm text-white hover:bg-white/10">
                        <SelectValue placeholder="Select Token" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-white/20 bg-black/95 text-white">
                        {SUPPORTED_TOKENS.map((token) => (
                          <SelectItem key={token} value={token} className="text-sm focus:bg-white/10 focus:text-white">
                            {token}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Participant Address (Required) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="participants" className="text-xs font-medium text-white/80">
                      Enter temporary wallet address <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="participants"
                      value={participantAddresses}
                      onChange={(e) => {
                        setParticipantAddresses(e.target.value);
                        setAddressError(null);
                        setError(null);
                      }}
                      placeholder="0x123...., 0x456...."
                      className={`h-9 rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:ring-white/20 ${addressError ? 'border-red-500 ring-1 ring-red-500' : ''
                        }`}
                    />
                    {addressError && (
                      <p className="text-sm text-red-400 mt-1">{addressError}</p>
                    )}
                  </div>

                  <div className={`mt-2 transition-all duration-200 ${error ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none select-none'}`}>
                    <div ref={errorRef} className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
                      {error || 'Placeholder'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center text-gray-700 mb-2">
                    <CheckCircle2 className="h-12 w-12" />
                  </div>
                  <p className="text-center font-medium text-white">Lightning Node Created!</p>
                  <p className="text-center text-sm text-white/60">
                    Share this QR code or URI with others to join the channel. Max {createdNode.maxParticipants} participants.
                  </p>

                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-xl border-2 border-white/20">
                      <QRCodeCanvas value={createdNode.uri} size={192} level="H" />
                    </div>
                  </div>

                  {createdNode.appSessionId && (
                    <div className="bg-white/5 rounded-xl border border-white/10 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white/50">Session ID</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(createdNode.appSessionId!);
                            setCopiedSessionId(true);
                            setTimeout(() => setCopiedSessionId(false), 2000);
                          }}
                          className="text-xs text-white/80 hover:text-white flex items-center gap-1 transition-colors"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedSessionId ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-white/90 break-all">{createdNode.appSessionId}</p>
                    </div>
                  )}

                  <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/80 font-medium text-sm">Lightning Node URI</span>
                      <button
                        onClick={handleCopyUri}
                        className="text-xs text-white/80 hover:text-white flex items-center gap-1 transition-colors"
                      >
                        <Copy className="h-3 w-3" />
                        {copiedUri ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs font-mono text-white/60 break-all">{createdNode.uri}</p>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-white/20 bg-transparent text-white hover:bg-white/10"
                      onClick={() => resetToStart('create')}
                    >
                      Create another
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-white/20 bg-transparent text-white hover:bg-white/10"
                      onClick={() => resetToStart('join')}
                    >
                      Join a node
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-white/20 bg-transparent text-white hover:bg-white/10"
                      onClick={handleClose}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Join Tab */}
            <TabsContent value="join" className="space-y-2 mt-10">
              {!success ? (
                <>
                  <div className="space-y-3 rounded-xl border border-white/10 p-3 bg-white/5">
                    <div className="space-y-1.5">
                      <Label htmlFor="join-uri" className="text-xs font-medium text-white/80">
                        Lightning Node URI <span className="text-red-400 ml-1">*</span>
                      </Label>
                      <Input
                        id="join-uri"
                        value={joinUri}
                        onChange={(e) => {
                          setJoinUri(e.target.value);
                          setError(null);
                        }}
                        placeholder="lightning://0x..."
                        className="h-9 rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:ring-white/20"
                      />
                      <p className="text-xs text-white/50">Paste the URI you received</p>
                    </div>
                  </div>

                  <div className={`mt-6 transition-all duration-200 ${error ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none select-none'}`}>
                    <div
                      ref={errorRef}
                      className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg text-sm scroll-mt-20 backdrop-blur-sm"
                    >
                      {error || 'Placeholder'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center text-white/80 mb-2">
                    <CheckCircle2 className="h-12 w-12" />
                  </div>
                  <p className="text-center font-medium text-white">Lightning Node Joined!</p>
                  <p className="text-center text-sm text-white/60">
                    You can share the URI/QR to invite others, or open the node to manage participants and transfers.
                  </p>

                  {joinedNode && (
                    <>
                      <div className="flex justify-center">
                        <div className="bg-white p-4 rounded-xl border-2 border-white/20">
                          <QRCodeCanvas value={joinedNode.uri} size={192} level="H" />
                        </div>
                      </div>

                      <div className="bg-white/5 rounded-xl border border-white/10 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-white/50">Session ID</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(joinedNode.appSessionId);
                              setCopiedSessionId(true);
                              setTimeout(() => setCopiedSessionId(false), 2000);
                            }}
                            className="text-xs text-white/80 hover:text-white flex items-center gap-1 transition-colors"
                          >
                            <Copy className="h-3 w-3" />
                            {copiedSessionId ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs font-mono text-white/90 break-all">{joinedNode.appSessionId}</p>
                      </div>

                      <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white/80 font-medium text-sm">Lightning Node URI</span>
                          <button
                            onClick={handleCopyUri}
                            className="text-xs text-white/80 hover:text-white flex items-center gap-1 transition-colors"
                          >
                            <Copy className="h-3 w-3" />
                            {copiedUri ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-xs font-mono text-white/60 break-all">{joinedNode.uri}</p>
                      </div>

                      <div className="bg-white/5 border border-white/10 text-white/80 px-4 py-3 rounded-lg text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Chain</span>
                          <span className="font-medium">{joinedNode.chain}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Token</span>
                          <span className="font-medium">{joinedNode.token}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Status</span>
                          <span className="font-medium">{joinedNode.status}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Max participants</span>
                          <span className="font-medium">{joinedNode.maxParticipants}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Quorum</span>
                          <span className="font-medium">{joinedNode.quorum}%</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Protocol</span>
                          <span className="font-medium">{joinedNode.protocol}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50">Challenge</span>
                          <span className="font-medium">{joinedNode.challenge}</span>
                        </div>
                      </div>

                      <div className="bg-white/5 rounded-xl border border-white/10 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/50">
                            Participants ({joinedNode.participants.length}/{joinedNode.maxParticipants})
                          </span>
                        </div>
                        <div className="mt-2 space-y-2 max-h-32 overflow-auto">
                          {joinedNode.participants.length === 0 ? (
                            <p className="text-xs text-white/40">No participants found.</p>
                          ) : (
                            joinedNode.participants.map((p) => (
                              <div key={p.id} className="flex items-center justify-between gap-2">
                                <span className="text-xs font-mono text-white/80 break-all">{p.address}</span>
                                <span className="text-xs text-white/50 whitespace-nowrap">{p.weight}%</span>
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

        <DialogFooter className="px-6 pb-6 pt-2 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
          {activeTab === 'create' && !createdNode && (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading} className="border-white/20 bg-transparent text-white hover:bg-white/10">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateNode}
                disabled={loading || !!addressError || !selectedChain || !participantAddresses.trim() || !SUPPORTED_CHAINS.find(c => c.id === selectedChain)}
                className="bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4 fill-black" />
                    Create
                  </>
                )}
              </Button>
            </>
          )}

          {activeTab === 'create' && createdNode && (
            <Button type="button" onClick={handleClose} className="w-full bg-white text-black hover:bg-white/90">
              Done
            </Button>
          )}

          {activeTab === 'join' && !success && (
            <>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading} className="border-white/20 bg-transparent text-white hover:bg-white/10">
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleJoinNode}
                disabled={loading || !joinUri.trim()}
                className="bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="w-full bg-white text-black hover:bg-white/90"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog >
  );
}

