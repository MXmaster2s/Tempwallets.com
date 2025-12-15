import { Copy, Check, Loader2, QrCode, Send, History, RefreshCw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@repo/ui/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useWalletV2 } from "@/hooks/useWalletV2";
import { walletStorage } from "@/lib/walletStorage";
import { useBrowserFingerprint } from "@/hooks/useBrowserFingerprint";
import { useAuth } from "@/hooks/useAuth";
import { walletApi } from "@/lib/api";
import { WalletConnectModal } from "./walletconnect-modal";
import { EvmWalletConnectModal } from "./evm-walletconnect-modal";
import { WalletHistoryModal } from "./wallet-history-modal";
import { SendCryptoModal } from "./send-crypto-modal";
import { WalletCard } from "./wallet-card";
import { ChainSelector } from "./chain-selector";
import { DEFAULT_CHAIN, getChainById } from "@/lib/chains";
import { useWalletConfig } from "@/hooks/useWalletConfig";
import {
  trackButtonClick,
  trackChangeButton,
  trackWalletGeneration,
  trackUserJourney,
} from "@/lib/tempwallets-analytics";
import { trackEvent } from "@/lib/mixpanel";

const WalletInfo = () => {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [selectedChainId, setSelectedChainId] = useState(DEFAULT_CHAIN.id);
  const [substrateWalletConnectOpen, setSubstrateWalletConnectOpen] = useState(false);
  const [evmWalletConnectOpen, setEvmWalletConnectOpen] = useState(false);
  const [walletHistoryOpen, setWalletHistoryOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [signInPromptOpen, setSignInPromptOpen] = useState(false);
  const { wallets, loading, error, loadWallets, getWalletByChainType } = useWalletV2();
  const walletConfig = useWalletConfig();
  
  // Auth - use Google user ID when authenticated
  const { user, isAuthenticated, userId: authUserId, loading: authLoading, login } = useAuth();
  
  // XP system - disabled for now
  // const { awardXP, awardXPOptimistic } = useXP();
  
  // Track chain changes
  const handleChainChange = (chainId: string) => {
    const previousChainId = selectedChainId;
    setSelectedChainId(chainId);
    // Chain change is tracked via the change button click
  };
  
  // Use browser fingerprint as unique user ID (fallback when not authenticated)
  const { fingerprint, loading: fingerprintLoading, generateNewWallet } = useBrowserFingerprint();
  
  // KISS: Use Google user ID when authenticated (from useAuth), otherwise fingerprint
  // authUserId already handles this logic in useAuth hook
  const userId = authUserId;
  const isAuthLoading = authLoading || fingerprintLoading || !userId;

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
      trackUserJourney.walletViewed(selectedChainId);
    }
  }, [currentWallet, loading, error, selectedChainId]);

  // Track loading state to prevent duplicate calls
  const loadingRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Load wallets when userId is ready and auth loading is complete
  useEffect(() => {
    // Wait for auth to complete loading before loading wallets
    if (authLoading) {
      return;
    }
    
    // Don't reload if userId hasn't changed and we're already loading
    if (loadingRef.current && lastUserIdRef.current === userId) {
      return;
    }
    
    if (userId) {
      // Clear cache if it doesn't have Substrate addresses (one-time migration)
      const cachedAddresses = walletStorage.getAddresses(userId);
      if (cachedAddresses) {
        const hasSubstrate = cachedAddresses.auxiliary?.some(
          (e) => e.category === 'substrate' && e.address
        );
        if (!hasSubstrate) {
          if (process.env.NODE_ENV === 'development') {
            console.log('Clearing cache - missing Substrate addresses');
          }
          walletStorage.clearAddresses();
        }
      }
      
      // Track loading state
      loadingRef.current = true;
      lastUserIdRef.current = userId;
      
      // Load wallets
      loadWallets(userId).finally(() => {
        loadingRef.current = false;
      });
    }
  }, [userId, authLoading]); // Only depend on userId and authLoading

  // History button is always visible (blurred when not authenticated)
  const actions = [
    { icon: QrCode, label: "Connect", action: "connect" },
    { icon: Send, label: "Send", action: "send" },
    { icon: Copy, label: "Copy", action: "copy" },
    { icon: History, label: "History", action: "history" },
    { icon: RefreshCw, label: "Create New", action: "change" },
  ];


  const getIconContainerStyles = (action: string) => {
    const baseStyles = "w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-colors";
    switch (action) {
      case 'connect':
        return `${baseStyles} bg-[#4C856F]`;
      case 'send':
      case 'copy':
      case 'history':
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
      // Track change button click
      trackChangeButton.clicked();
      
      // Get the current values at click time
      const currentUserId = userId;
      const currentIsAuthenticated = isAuthenticated;
      
      // When authenticated with Google, "Change" creates a new wallet under the same Google account
      // When not authenticated, it generates a new fingerprint
      if (currentUserId) {
        // Track wallet generation initiation
        trackWalletGeneration.initiated();
        
        const startTime = Date.now();
        
        // Clear the cache for current user first
        walletStorage.clearAddresses();
        
        let walletIdToUse = currentUserId;
        
        // Only generate new fingerprint if NOT authenticated with Google
        // When authenticated, we regenerate the seed for the same user ID
        if (!currentIsAuthenticated) {
          walletIdToUse = generateNewWallet();
        } else {
          // When authenticated with Google, create a new seed for the same user ID
          try {
            await walletApi.createOrImportSeed({
              userId: currentUserId,
              mode: 'random',
            });
          } catch (error) {
            console.error('Failed to create new seed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            trackChangeButton.failed(errorMessage);
            trackWalletGeneration.failed(errorMessage);
            return; // Don't continue if seed creation failed
          }
        }
        
        // Force refresh to fetch new wallets immediately
        await loadWallets(walletIdToUse, true);
        
        // Track successful wallet generation
        const duration = Date.now() - startTime;
        const newWallet = wallets.find(w => w.chain === selectedChainId) || getWalletByChainType(selectedChain.type);
        if (newWallet) {
          trackWalletGeneration.success(newWallet.address, selectedChainId, duration);
        }
      }
    } else if (action === 'copy' && currentWallet) {
      await copyToClipboard(currentWallet.address);
    } else if (action === 'send') {
      // Track send button click
      trackButtonClick.send();
      
      // Open send modal instead of navigating to transactions page
      if (userId && selectedChainId) {
        setSendModalOpen(true);
      }
    } else if (action === 'history') {
      // Track transaction history viewed
      trackUserJourney.transactionHistoryViewed();
      
      // Check if user is authenticated
      if (isAuthenticated && userId) {
        // Open wallet history modal for authenticated users
        setWalletHistoryOpen(true);
      } else {
        // Show sign-in prompt for unauthenticated users
        setSignInPromptOpen(true);
      }
    } else if (action === 'connect') {
      // Track receive button click (connect is used for receive)
      trackButtonClick.receive();
      
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
      trackEvent("wallet_address_copied", {
        chainId: selectedChainId,
        chainName: selectedChain.name,
        chainType: selectedChain.type,
        isSmartAccount: selectedChainConfig?.isSmartAccount || false,
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
        loading={isAuthLoading || loading}
        error={error}
      />

  {/* Action Buttons */}
  <div className="rounded-3xl p-4 md:p-6 mt-0 pt-6 md:pt-8" style={{ backgroundColor: '#161616' }}>
        <TooltipProvider>
          <div className="grid gap-2 md:gap-4 grid-cols-5 w-full">
            {actions.map((action, index) => {
              const isDisabled = 
                (loading && action.action === 'change') || 
                (!selectedChain.hasWalletConnect && action.action === 'connect');
              
              // History button should be dimmed when not authenticated
              const isHistoryDimmed = action.action === 'history' && !isAuthenticated;
              
              return (
                <Tooltip key={`${action.action}-${index}`} delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleActionClick(action.action)}
                      disabled={isDisabled}
                      data-action={action.action}
                      className={`flex flex-col items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed transition-all w-full ${
                        isHistoryDimmed ? 'opacity-50' : ''
                      }`}
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
                      <span className={`text-xs md:text-sm lg:text-sm font-rubik-normal ${
                        isHistoryDimmed ? 'text-white/50' : 'text-white'
                      }`}>
                        {loading && action.action === 'change' ? 'Creating...' : 
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

      {/* Wallet History Modal - Always rendered, but only functional when authenticated */}
      {userId && (
        <WalletHistoryModal
          open={walletHistoryOpen}
          onOpenChange={setWalletHistoryOpen}
          userId={userId}
          onSwitchWallet={async () => {
            // Reload wallets after switching
            await loadWallets(userId, true);
          }}
        />
      )}

      {/* Sign-In Prompt Dialog */}
      <AlertDialog open={signInPromptOpen} onOpenChange={setSignInPromptOpen}>
        <AlertDialogContent className="border-white/10 bg-black/90 text-white shadow-2xl backdrop-blur sm:max-w-[425px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold flex items-center gap-2">
              Sign In Required
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-white/70 pt-2">
              If you want to view the history of your past wallets that you have used, please sign in using Google SSO.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:gap-0">
            <AlertDialogCancel className="bg-white/10 text-white hover:bg-white/20 border-white/20">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSignInPromptOpen(false);
                login();
              }}
              className="bg-[#4C856F] text-white hover:bg-[#4C856F]/90"
            >
              Sign In with Google
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Crypto Modal */}
      {userId && selectedChainId && (
        <SendCryptoModal
          open={sendModalOpen}
          onOpenChange={setSendModalOpen}
          chain={selectedChainId}
          userId={userId}
          onSuccess={() => {
            // Refresh balances after successful send
            if (currentWallet) {
              loadWallets(userId, true);
            }
          }}
        />
      )}
    </div>
  );
};

export default WalletInfo;