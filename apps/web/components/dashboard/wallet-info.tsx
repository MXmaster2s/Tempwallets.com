import { Copy, Check, Loader2, RefreshCw, QrCode, Send } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@repo/ui/components/ui/tooltip";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWalletV2 } from "@/hooks/useWalletV2";
import { walletStorage } from "@/lib/walletStorage";
import { useBrowserFingerprint } from "@/hooks/useBrowserFingerprint";
import { WalletConnectModal } from "./walletconnect-modal";
import { EvmWalletConnectModal } from "./evm-walletconnect-modal";
import { WalletCard } from "./wallet-card";
import { ChainSelector } from "./chain-selector";
import { DEFAULT_CHAIN, getChainById } from "@/lib/chains";
import { useWalletConfig } from "@/hooks/useWalletConfig";
import { trackMixpanelEvent } from "@/lib/mixpanel";

const WalletInfo = () => {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState(DEFAULT_CHAIN.id);
  const [substrateWalletConnectOpen, setSubstrateWalletConnectOpen] = useState(false);
  const [evmWalletConnectOpen, setEvmWalletConnectOpen] = useState(false);
  const { wallets, loading, error, loadWallets, getWalletByChainType } = useWalletV2();
  const walletConfig = useWalletConfig();
  
  // Track chain changes
  const handleChainChange = (chainId: string) => {
    const previousChainId = selectedChainId;
    setSelectedChainId(chainId);
    
    trackMixpanelEvent("V2-Dashboard", {
      action: "chain_changed",
      previousChainId,
      newChainId: chainId,
      timestamp: new Date().toISOString(),
      source: "web-app",
    });
  };
  
  // Use browser fingerprint as unique user ID
  const { fingerprint, loading: fingerprintLoading, generateNewWallet } = useBrowserFingerprint();

  // Get selected chain from new config (fallback to old chains.ts for backward compatibility)
  const selectedChainConfig = walletConfig.getById(selectedChainId);
  const selectedChain = selectedChainConfig 
    ? { ...selectedChainConfig, hasWalletConnect: selectedChainConfig.capabilities.walletConnect }
    : (getChainById(selectedChainId) ?? DEFAULT_CHAIN);
  
  // Get wallet by specific chain ID instead of just by type
  // This ensures we get the correct wallet when switching between EOA and Smart Account variants
  const currentWallet = wallets.find(w => w.chain === selectedChainId) || getWalletByChainType(selectedChain.type);

  // Track wallet display in Mixpanel
  useEffect(() => {
    if (currentWallet && !loading && !error) {
      trackMixpanelEvent("V2-Dashboard", {
        action: "wallet_displayed",
        chainId: selectedChainId,
        chainName: selectedChain.name,
        chainType: selectedChain.type,
        walletAddress: currentWallet.address,
        isSmartAccount: selectedChainConfig?.isSmartAccount || false,
        timestamp: new Date().toISOString(),
        source: "web-app",
      });
    }
  }, [currentWallet, loading, error, selectedChainId, selectedChain, selectedChainConfig]);

  // Load wallets when fingerprint is ready
  useEffect(() => {
    if (fingerprint) {
      // Clear cache if it doesn't have Substrate addresses (one-time migration)
      const cachedAddresses = walletStorage.getAddresses(fingerprint);
      if (cachedAddresses) {
        const hasSubstrate = cachedAddresses.auxiliary?.some(
          (e) => e.category === 'substrate' && e.address
        );
        if (!hasSubstrate) {
          console.log('🧹 Clearing cache - missing Substrate addresses');
          walletStorage.clearAddresses();
        }
      }
      // Always load wallets (will fetch fresh if cache was cleared)
      loadWallets(fingerprint);
    }
  }, [loadWallets, fingerprint]);

  const actions = [
    { icon: QrCode, label: "Connect", action: "connect" },
    { icon: Send, label: "Send", action: "send" },
    { icon: Copy, label: "Copy", action: "copy" },
    { icon: RefreshCw, label: "Change", action: "change" },
  ];

  const getIconContainerStyles = (action: string) => {
    const baseStyles = "w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-colors";
    switch (action) {
      case 'connect':
        return `${baseStyles} bg-[#4C856F]`;
      case 'send':
      case 'copy':
        return `${baseStyles} bg-[#292929]`;
      case 'change':
        return `${baseStyles} bg-transparent`;
      default:
        return baseStyles;
    }
  };

  const truncateAddress = (address: string) => {
    if (address.length <= 15) return address;
    return `${address.slice(0, 7)}...${address.slice(-5)}`;
  };

  const handleActionClick = async (action: string) => {
    if (action === 'change') {
      if (fingerprint) {
        console.log('🔄 Change button clicked - Current fingerprint:', fingerprint);
        
        // Track wallet change action
        trackMixpanelEvent("V2-Dashboard", {
          action: "wallet_change_initiated",
          previousChainId: selectedChainId,
          timestamp: new Date().toISOString(),
          source: "web-app",
        });
        
        // Clear the cache for current user first
        walletStorage.clearAddresses();
        console.log('🧹 Cleared wallet cache');
        
        // Generate new wallet ID (this updates fingerprint and triggers useEffect)
        const newWalletId = generateNewWallet();
        console.log('✨ Generated new wallet ID:', newWalletId);
        
        // Force refresh to fetch new wallets immediately
        // The useEffect will also trigger, but this ensures immediate update
        console.log('📡 Fetching new wallets from backend...');
        await loadWallets(newWalletId, true);
        console.log('✅ New wallets loaded successfully');
        
        // Track successful wallet creation
        trackMixpanelEvent("V2-Dashboard", {
          action: "wallet_created",
          newFingerprint: newWalletId,
          chainId: selectedChainId,
          timestamp: new Date().toISOString(),
          source: "web-app",
        });
      }
    } else if (action === 'copy' && currentWallet) {
      await copyToClipboard(currentWallet.address);
    } else if (action === 'send') {
      router.push('/transactions');
    } else if (action === 'connect') {
      // Open appropriate WalletConnect modal based on chain type
      if (selectedChain.hasWalletConnect) {
        if (selectedChain.type === 'evm') {
          setEvmWalletConnectOpen(true);
        } else if (selectedChain.type === 'substrate') {
          setSubstrateWalletConnectOpen(true);
        }
      }
    }
  };

  const copyToClipboard = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      // Track address copy action
      trackMixpanelEvent("V2-Dashboard", {
        action: "wallet_address_copied",
        chainId: selectedChainId,
        chainName: selectedChain.name,
        chainType: selectedChain.type,
        isSmartAccount: selectedChainConfig?.isSmartAccount || false,
        timestamp: new Date().toISOString(),
        source: "web-app",
      });
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Wallet Card - Fixed (no carousel) */}
      <WalletCard
        wallet={currentWallet}
        chain={selectedChain}
        loading={fingerprintLoading || loading}
        error={error}
      />

  {/* Action Buttons */}
  <div className="rounded-3xl p-4 md:p-6 mt-0 pt-6 md:pt-8" style={{ backgroundColor: '#161616' }}>
        <TooltipProvider>
          <div className="grid grid-cols-4 gap-2 md:gap-4">
            {actions.map((action) => {
              const isDisabled = 
                (loading && action.action === 'change') || 
                (!selectedChain.hasWalletConnect && action.action === 'connect');
              
              return (
                <Tooltip key={action.label} delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleActionClick(action.action)}
                      disabled={isDisabled}
                      className="flex flex-col items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className={getIconContainerStyles(action.action)}>
                        {loading && action.action === 'change' ? (
                          <Loader2 className="h-6 w-6 md:h-8 md:w-8 text-white animate-spin" />
                        ) : action.action === 'copy' && copied ? (
                          <Check className="h-6 w-6 md:h-8 md:w-8 text-white" />
                        ) : (
                          <action.icon className="h-6 w-6 md:h-8 md:w-8 text-white" />
                        )}
                      </div>
                      <span className="text-xs md:text-sm lg:text-sm font-rubik-normal text-white">
                        {loading && action.action === 'change' ? 'Changing...' : 
                         action.action === 'copy' && copied ? 'Copied!' : 
                         action.label}
                      </span>
                    </button>
                  </TooltipTrigger>
                  {action.action === 'connect' && (
                    <TooltipContent 
                      side="top" 
                      className="bg-black/20 backdrop-blur-sm text-white text-xs px-3 rounded-lg border border-white/20 max-w-xs"
                    >
                      <p>
                        {selectedChain.hasWalletConnect 
                          ? selectedChain.type === 'evm' 
                            ? 'Connect to EVM DApp (Uniswap, Aave, etc.)'
                            : 'Connect to Polkadot DApp (Hydration, etc.)'
                          : `WalletConnect not available for ${selectedChain.name}`}
                      </p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </div>

      {/* Chain Selector - Replaces Quick Actions */}
      <ChainSelector
        selectedChainId={selectedChainId}
        onChainChange={handleChainChange}
      />

      {/* WalletConnect Modals */}
      {/* Substrate/Polkadot WalletConnect */}
      <WalletConnectModal 
        open={substrateWalletConnectOpen} 
        onOpenChange={setSubstrateWalletConnectOpen} 
      />
      
      {/* EVM WalletConnect */}
      <EvmWalletConnectModal 
        open={evmWalletConnectOpen} 
        onOpenChange={setEvmWalletConnectOpen} 
      />
    </div>
  );
};

export default WalletInfo;