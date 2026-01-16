'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Loader2, Zap, Copy, ChevronRight, Mail, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@repo/ui/components/ui/tooltip';
import { useLightningNodes } from '@/hooks/lightning-nodes-context';
import { CreateLightningNodeModal } from './create-lightning-node-modal';
import { LightningNodeDetails } from './lightning-node-details';
import { FundChannelModal } from '../modals/fund-channel-modal';
import { LightningNode } from '@/lib/api';

const LAST_SELECTED_LN_NODE_ID_KEY = 'tempwallets:lastSelectedLightningNodeId';

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

/**
 * Authentication Status Banner Component
 * Shows wallet authentication status at the top
 */
function AuthenticationBanner({
  authenticated,
  authenticating,
  walletAddress,
  error,
}: {
  authenticated: boolean;
  authenticating: boolean;
  walletAddress: string | null;
  error: string | null;
}) {
  const [copiedAddress, setCopiedAddress] = useState(false);

  const handleCopyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  if (authenticating) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
        <div>
          <p className="font-rubik-medium text-gray-900">Authenticating Wallet</p>
          <p className="text-sm text-gray-700">Establishing clearnode connection...</p>
        </div>
      </div>
    );
  }

  if (error && !authenticated) {
    return (
      <div className="bg-gray-100 border border-gray-300 rounded-xl p-4 mb-4 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-gray-700" />
        <div>
          <p className="font-rubik-medium text-gray-900">Authentication Failed</p>
          <p className="text-sm text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  if (authenticated && walletAddress) {
    return (
      <div className="space-y-3 mb-4">
        {/* Wallet Status */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-gray-700" />
          <div className="flex-1">
            <p className="font-rubik-medium text-gray-900">
              Wallet Authenticated
            </p>
            <div className="flex items-center gap-2 mt-1">
              <p 
                className="text-sm text-gray-700 font-mono cursor-pointer hover:text-gray-900 transition-colors"
                onClick={handleCopyAddress}
                title="Click to copy full address"
              >
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </p>
              <button
                onClick={handleCopyAddress}
                className="text-gray-600 hover:text-gray-900 transition-colors p-1 rounded hover:bg-gray-200"
                title="Copy wallet address"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {copiedAddress && (
                <span className="text-xs text-green-600 font-medium">Copied!</span>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* Unified Balance tile (Coming Soon) */}
            <TooltipProvider>
              <Tooltip delayDuration={150}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-black text-white text-xs font-rubik-medium cursor-not-allowed opacity-80"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Unified Balance
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="bg-black/85 text-white text-xs px-3 py-2 rounded-md border border-white/10 max-w-xs space-y-1.5"
                >
                  <p className="font-semibold">Unified Balance</p>
                  <p className="text-[11px] font-medium text-gray-200">Coming soon</p>
                  <p className="text-[11px]">
                    Unified balance funding is disabled in production right now. This feature will be available soon.
                  </p>
                  <p className="pt-1 text-[11px] text-white/80">
                    Add Funds to Unified Balance
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Join search input removed; join is now inside the Create modal.

/**
 * Lightning Node Card Component
 * Displays information about a single Lightning Node
 */
function LightningNodeCard({
  node,
  onClick,
  isInvitation = false,
}: {
  node: LightningNode;
  onClick?: () => void;
  isInvitation?: boolean;
}) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);

  const handleCopyChannelId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(node.appSessionId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyUri = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(node.uri);
    setCopiedUri(true);
    setTimeout(() => setCopiedUri(false), 2000);
  };

  const participantCount = node.participants.length;
  const totalBalance = node.participants.reduce((sum, p) => sum + BigInt(p.balance), BigInt(0));
  const balanceHuman = (Number(totalBalance) / 1e6).toFixed(2);

  const statusColor = 'bg-gray-200 text-gray-800';

  const statusText = {
    open: 'Open',
    closed: 'Closed',
  }[node.status] || 'Unknown';

  return (
    <div
      className={`bg-white rounded-2xl p-4 space-y-3 border transition-colors cursor-pointer group ${
        isInvitation
          ? 'border-gray-200 hover:border-gray-300'
          : 'border-gray-200 hover:border-gray-300'
      }`}
      onClick={onClick}
    >
      {/* Header with Status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gray-100">
            {isInvitation ? (
              <Mail className="h-5 w-5 text-gray-700" />
            ) : (
              <Zap className="h-5 w-5 text-gray-700" />
            )}
          </div>
          <div>
            <h3 className="font-rubik-medium text-gray-900">
              {CHAIN_NAMES[node.chain] || node.chain}
            </h3>
            <p className="text-sm text-gray-500">{node.token}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
            {statusText}
          </span>
          {isInvitation && (
            <span className="text-xs text-gray-700 font-medium">New Invitation</span>
          )}
        </div>
      </div>

      {/* Balance */}
      <div className="bg-gray-50 rounded-xl p-3">
        <p className="text-xs text-gray-500 mb-1">Total Channel Balance</p>
        <p className="text-lg font-rubik-medium text-gray-900">
          {balanceHuman} {node.token}
        </p>
      </div>

      {/* Participants */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-600">Participants</span>
        <span className="font-rubik-medium text-gray-900">
          {participantCount} / {node.maxParticipants}
        </span>
      </div>

      {/* App Session ID */}
      <div className="bg-gray-50 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-500">Session ID</p>
          <button
            onClick={handleCopyChannelId}
            className="text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1"
          >
            <Copy className="h-3 w-3" />
            {copiedId ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs font-mono text-gray-700 break-all">
          {node.appSessionId}
        </p>
      </div>

      {/* Lightning URI (for sharing) */}
      {node.status === 'open' && participantCount < node.maxParticipants && (
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-700 font-medium">Share this link</p>
            <button
              onClick={handleCopyUri}
              className="text-xs text-gray-700 hover:text-gray-900 flex items-center gap-1"
            >
              <Copy className="h-3 w-3" />
              {copiedUri ? 'Copied!' : 'Copy URI'}
            </button>
          </div>
          <p className="text-xs font-mono text-gray-700 break-all">
            {node.uri}
          </p>
        </div>
      )}

      {/* View Details */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Created {new Date(node.createdAt).toLocaleDateString()}
        </div>
  <div className="flex items-center gap-1 text-xs text-gray-700 group-hover:text-black">
          <span>{isInvitation ? 'View Invitation' : 'View Details'}</span>
          <ChevronRight className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}

/**
 * Lightning Nodes View Component
 * Main dashboard view with authentication, invitations, search, and active sessions
 */
export function LightningNodesView() {
  const {
    authenticated,
    authenticating,
    walletAddress,
    allSessions,
    activeSessions,
    invitations,
    searchSession,
    authenticate,
    discoverSessions,
    loading,
    error,
  } = useLightningNodes();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [fundChannelModalOpen, setFundChannelModalOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // OPTIMIZATION: On-demand authentication and session discovery
  // Trigger authentication when component mounts (user navigates to Lightning section)
  useEffect(() => {
    const initializeLightningNodes = async () => {
      if (!authenticated && !authenticating) {
        console.log('[LightningNodesView] User navigated to Lightning section - initializing...');
        await authenticate('base');
        
        // After authentication, fetch sessions
        await discoverSessions('base');
      } else if (authenticated && allSessions.length === 0 && !loading) {
        // Already authenticated but no sessions loaded yet
        console.log('[LightningNodesView] Authenticated but no sessions loaded - fetching...');
        await discoverSessions('base');
      }
    };

    initializeLightningNodes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Restore last-opened node after refresh
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_SELECTED_LN_NODE_ID_KEY);
      if (saved) setSelectedNodeId(saved);
    } catch {
      // ignore (SSR / privacy mode)
    }
  }, []);

  // Persist selection
  useEffect(() => {
    try {
      if (selectedNodeId) {
        window.localStorage.setItem(LAST_SELECTED_LN_NODE_ID_KEY, selectedNodeId);
      } else {
        window.localStorage.removeItem(LAST_SELECTED_LN_NODE_ID_KEY);
      }
    } catch {
      // ignore
    }
  }, [selectedNodeId]);

  // Deep link handling - auto-search if session param is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');

    if (sessionParam && authenticated && !selectedNodeId) {
      console.log('[Lightning] Deep link detected:', sessionParam);
      handleSearch(sessionParam);

      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [authenticated, selectedNodeId]);

  const handleSearch = async (sessionId: string) => {
    setSearchError(null);

    try {
      const node = await searchSession(sessionId);
      if (node) {
        setSelectedNodeId(node.id);
      } else {
        setSearchError('Session not found or you are not a participant');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search for session';
      setSearchError(errorMessage);
    }
  };

  // Show Lightning Node details if one is selected
  if (selectedNodeId) {
    return (
      <LightningNodeDetails
        lightningNodeId={selectedNodeId}
        onClose={() => setSelectedNodeId(null)}
      />
    );
  }

  // Show loading state while authenticating
  if (authenticating && !authenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
        <p className="text-gray-500 font-rubik-normal">Authenticating wallet...</p>
        <p className="text-sm text-gray-400 mt-2">Connecting to Yellow Network</p>
      </div>
    );
  }

  const safeActiveSessions = activeSessions || [];
  const safeInvitations = invitations || [];
  const hasAnySessions = safeActiveSessions.length > 0 || safeInvitations.length > 0;

  // Show empty state if no sessions
  if (!hasAnySessions && !loading) {
    return (
      <>
        {/* Authentication Banner */}
        <AuthenticationBanner
          authenticated={authenticated}
          authenticating={authenticating}
          walletAddress={walletAddress}
          error={error}
        />

        {/* Empty State */}
        <div className="flex flex-col items-center justify-center py-16 md:py-20">
          <div className="-mt-32">
            <Image
              src="/empty-mailbox-illustration-with-spiderweb-and-flie-2025-10-20-04-28-09-utc.gif"
              alt="No Lightning Nodes"
              width={320}
              height={320}
              className="object-contain mix-blend-multiply"
            />
          </div>
          <p className="text-gray-600 text-lg md:text-xl font-rubik-medium z-10 -mt-16 mb-4">
            No Lightning Nodes Available
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Create a new Lightning Node or join an existing one using the button below
          </p>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="bg-black text-white px-6 py-3 rounded-xl font-rubik-medium hover:bg-gray-800 transition-colors flex items-center gap-2 shadow-lg shadow-gray-300/50 border border-gray-300 active:scale-[0.99]"
          >
            <Zap className="h-4 w-4" />
            Create / Join Lightning Node
          </button>
        </div>

        <CreateLightningNodeModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          onJoined={(node) => {
            setSelectedNodeId(node.id);
          }}
        />

        <FundChannelModal
          open={fundChannelModalOpen}
          onOpenChange={setFundChannelModalOpen}
          chain="base"
          asset="usdc"
          onFundComplete={() => {
            // Optionally refresh data after funding
          }}
        />
      </>
    );
  }

  // Show list of Lightning Nodes
  return (
    <>
      {/* Authentication Banner */}
      <AuthenticationBanner
        authenticated={authenticated}
        authenticating={authenticating}
        walletAddress={walletAddress}
        error={error}
      />

      <div className="space-y-6">
        {/* New Invitations Section */}
        {safeInvitations.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-rubik-medium text-gray-900">
                  New Invitations
                </h2>
                <span className="bg-blue-100 text-blue-700 text-xs font-medium px-2 py-1 rounded-full">
                  {safeInvitations.length}
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {safeInvitations.map((node) => (
                <LightningNodeCard
                  key={node.appSessionId}
                  node={node}
                  onClick={() => setSelectedNodeId(node.id)}
                  isInvitation={true}
                />
              ))}
            </div>
          </div>
        )}

        {/* Active Sessions Section */}
        {safeActiveSessions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-gray-700" />
                <h2 className="text-base sm:text-lg font-rubik-medium text-gray-900">
                  My Lightning Nodes
                  <span className="ml-2 bg-gray-100 text-gray-700 text-[10px] sm:text-xs font-medium px-2 py-1 rounded-full">
                    {safeActiveSessions.length}
                  </span>
                </h2>
              </div>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="bg-black text-white px-4 py-2 rounded-xl font-rubik-medium hover:bg-gray-800 transition-colors flex items-center gap-2 text-sm shadow-lg shadow-gray-300/50 border border-gray-300 active:scale-[0.99]"
              >
                <Zap className="h-4 w-4" />
                Create / Join
              </button>
            </div>
            <div className="space-y-3">
              {safeActiveSessions.map((node) => (
                <LightningNodeCard
                  key={node.appSessionId}
                  node={node}
                  onClick={() => setSelectedNodeId(node.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <CreateLightningNodeModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onJoined={(node) => {
          setSelectedNodeId(node.id);
          setCreateModalOpen(false);
        }}
      />

      <FundChannelModal
        open={fundChannelModalOpen}
        onOpenChange={setFundChannelModalOpen}
        chain="base"
        asset="usdc"
        onFundComplete={() => {
          // Optionally refresh data after funding
        }}
      />
    </>
  );
}
