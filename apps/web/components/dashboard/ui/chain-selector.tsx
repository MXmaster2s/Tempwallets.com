'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Plus, CircleHelp } from 'lucide-react';
import { useWalletConfig } from '@/hooks/useWalletConfig';
import { cn } from '@repo/ui/lib/utils';
import { ChainListModal } from '@/components/dashboard/modals/chain-list-modal';

interface ChainSelectorProps {
  selectedChainId: string;
  onChainChange: (chainId: string) => void;
  className?: string;
}

export function ChainSelector({
  selectedChainId,
  onChainChange,
  className,
}: ChainSelectorProps) {
  const walletConfig = useWalletConfig();
  const visibleChains = walletConfig.getVisible();
  const [showList, setShowList] = useState(false);

  // Get all mainnet chains for the list view (MVP: Filtered to Gasless EVMs, Polkadot, Aptos)
  // Full list available in modal - horizontal selector only shows 4 chains
  const allChains = useMemo(() => {
    const isDev = walletConfig.isDev;
    return walletConfig.getMainnet()
      .filter((config) => {
        // Exclude testnets (getMainnet already does this, but being explicit)
        if (config.isTestnet) {
          return false;
        }

        // Honor feature flags: hide entries that are disabled for list/selector,
        // but EOAs stay visible if showInWalletList is true.
        if (!config.features.showInWalletList) {
          return false;
        }

        // Remove chains that show "Coming Soon" (no walletConnect AND not Aptos)
        // Exception: Aptos doesn't have walletConnect but we want to keep it
        if (!config.capabilities.walletConnect && config.type !== 'aptos') {
          return false; // Remove "Coming Soon" chains
        }

        return true;
      })
      .sort((a, b) => {
        // First, sort by enabled status (enabled chains first)
        const aEnabled = isDev ? a.features.enabledInDev : a.features.enabledInProd;
        const bEnabled = isDev ? b.features.enabledInDev : b.features.enabledInProd;

        if (aEnabled !== bEnabled) {
          return aEnabled ? -1 : 1; // enabled (true) comes before disabled (false)
        }

        // Then by priority
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        // Finally by name
        return a.name.localeCompare(b.name);
      });
  }, [walletConfig]);

  // Track the history of selected chains (Last 4 unique chains)
  const [chainHistory, setChainHistory] = useState<string[]>(() => {
    // Initial state: Selected Chain + Defaults (Ethereum, Base, Arbitrum, Polygon)
    const defaults = ['ethereumErc4337', 'baseErc4337', 'arbitrumErc4337', 'polygonErc4337'];
    const initial = [selectedChainId, ...defaults];
    // Remove duplicates
    return Array.from(new Set(initial)).slice(0, 4);
  });

  // Update history when selection changes
  useEffect(() => {
    setChainHistory((prev) => {
      // 1. Add new selection to the front
      const newHistory = [selectedChainId, ...prev];
      // 2. Remove duplicates (keeping the first occurrence)
      const uniqueHistory = Array.from(new Set(newHistory));
      // 3. Keep only top 4
      return uniqueHistory.slice(0, 4);
    });
  }, [selectedChainId]);

  // Determine which chains to display in the horizontal selector
  const displayChains = useMemo(() => {
    return chainHistory
      .map(id => walletConfig.getById(id))
      .filter((config): config is NonNullable<typeof config> => !!config);
  }, [chainHistory, walletConfig]);

  // Group chains by type for better organization
  const groupedChains = useMemo(() => {
    const groups: Record<string, typeof allChains> = {
      'GASLESS CHAINS / EIP-7702': [],
      'EVM EOA WALLETS': [],
      'COMPATIBLE LIGHTNING NODE WALLETS': [],
      'Substrate': [],
      'Aptos': [],
      'Other': [],
    };

    allChains.forEach((chain) => {
      if (chain.isSmartAccount) {
        groups['GASLESS CHAINS / EIP-7702']!.push(chain);

        // Add specific chains to LN Compatible section
        if (['ethereumErc4337', 'baseErc4337', 'arbitrumErc4337'].includes(chain.id)) {
          groups['COMPATIBLE LIGHTNING NODE WALLETS']!.push(chain);
        }
      } else if (chain.type === 'evm') {
        // Include EOA wallets in EVM Chains group
        groups['EVM EOA WALLETS']!.push(chain);
      } else if (chain.type === 'substrate') {
        groups['Substrate']!.push(chain);
      } else if (chain.type === 'aptos') {
        groups['Aptos']!.push(chain);
      } else {
        groups['Other']!.push(chain);
      }
    });

    // Remove empty groups
    return Object.entries(groups).filter(([_, chains]) => chains.length > 0);
  }, [allChains]);

  const handleChainSelect = (chainId: string) => {
    onChainChange(chainId);
    setShowList(false);
  };

  // Lock body scroll when modal is open
  useEffect(() => {
    if (showList) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showList]);

  return (
    <>
      <div className={cn('rounded-3xl p-3 md:p-4 mt-4', className)} style={{ backgroundColor: '#292828' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white text-sm md:text-base font-rubik-regular">More Networks</h3>
          <button
            onClick={() => setShowList(true)}
            className="text-white/40 text-xs md:text-sm font-rubik-regular hover:text-white/60 transition-colors cursor-pointer"
          >
            See List
          </button>
        </div>

        {/* Horizontal scrollable chain icons - 4 visible at a time */}
        <div className="overflow-x-auto overflow-y-hidden scrollbar-hide">
          <div className="flex gap-3 snap-x snap-mandatory">
            {displayChains.map((chain) => {
              const isSelected = selectedChainId === chain.id;
              const Icon = chain.icon;

              return (
                <button
                  key={chain.id}
                  onClick={() => onChainChange(chain.id)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl transition-all flex-shrink-0 snap-start',
                    'hover:scale-105 active:scale-95',
                    // Make each icon take 1/4 of the container width (minus gaps)
                    'w-[calc(25%-0.5625rem)]',
                    isSelected
                      ? 'scale-105 shadow-lg'
                      : 'opacity-70 hover:opacity-100'
                  )}
                  style={{
                    minWidth: 'calc(25% - 0.5625rem)',
                  }}
                >
                  <div className="relative">
                    <Icon
                      className="w-9 h-9 md:w-10 md:h-10"
                      style={{ fill: 'currentColor', color: chain.color || '#ffffff' }}
                    />
                    {isSelected && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#292828]" />
                    )}
                  </div>
                  <div className="flex flex-col items-center gap-0.5 min-h-[36px]">
                    <span
                      className={cn(
                        'text-[11px] md:text-xs font-rubik-medium whitespace-nowrap',
                        isSelected ? 'text-white' : 'text-white/70'
                      )}
                    >
                      {chain.name}
                    </span>
                    {/* Tags: Gasless and Coming Soon */}
                    <div className="flex flex-col items-center gap-0.5 min-h-[14px]">
                      {chain.isSmartAccount && (
                        <>
                          <span className="px-1 py-0 text-[9px] bg-blue-500/20 text-blue-400 rounded-full font-rubik-medium leading-tight">
                            Gasless
                          </span>
                          <span className="text-[8px] text-white/30 font-rubik-medium leading-tight">
                            EIP-7702
                          </span>
                        </>
                      )}
                      {/* EOA Label for EVM standard wallets */}
                      {!chain.isSmartAccount && chain.type === 'evm' && (
                        <span className="px-1 py-0 text-[9px] bg-purple-500/20 text-purple-400 rounded-full font-rubik-medium leading-tight">
                          EOA
                        </span>
                      )}
                      {(!chain.capabilities?.walletConnect && chain.type !== 'aptos' && chain.type !== 'evm') && (
                        <span className="px-1 py-0 text-[8px] bg-orange-500/20 text-orange-400 rounded-full font-rubik-medium leading-tight border border-orange-500/30">
                          Coming Soon
                        </span>
                      )}
                      {/* Spacer for alignment - only show if NO other tags are shown */}
                      {!chain.isSmartAccount &&
                        (chain.capabilities?.walletConnect || chain.type === 'aptos') &&
                        chain.type !== 'evm' && (
                          <span className="h-[14px]" />
                        )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Chain List Modal */}
      <ChainListModal
        isOpen={showList}
        onClose={() => setShowList(false)}
        onSelect={handleChainSelect}
        selectedChainId={selectedChainId}
      />
    </>
  );
}
