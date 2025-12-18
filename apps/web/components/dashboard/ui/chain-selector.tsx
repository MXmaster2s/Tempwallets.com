'use client';

import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { useWalletConfig } from '@/hooks/useWalletConfig';
import { cn } from '@repo/ui/lib/utils';

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
        // MVP FILTERS: Only show Gasless EVMs, Polkadot, and Aptos in modal
        
        // Exclude testnets (getMainnet already does this, but being explicit)
        if (config.isTestnet) {
          return false;
        }
        
        // For EVM chains: Only keep gasless (smart accounts), remove EOA wallets
        if (config.type === 'evm') {
          if (!config.isSmartAccount) {
            return false; // Remove non-gasless EVM chains (EOA wallets)
          }
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

  // Group chains by type for better organization
  const groupedChains = useMemo(() => {
    const groups: Record<string, typeof allChains> = {
      'Gasless': [],
      'EVM Chains': [],
      'Substrate': [],
      'Aptos': [],
      'Other': [],
    };

    allChains.forEach((chain) => {
      if (chain.isSmartAccount) {
        groups['Gasless']!.push(chain);
      } else if (chain.type === 'evm') {
        // Include EOA wallets in EVM Chains group
        groups['EVM Chains']!.push(chain);
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
          {visibleChains.map((chain) => {
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
                      <span className="px-1 py-0 text-[9px] bg-blue-500/20 text-blue-400 rounded-full font-rubik-medium leading-tight">
                        Gasless
                      </span>
                    )}
                    {(!chain.capabilities?.walletConnect && chain.type !== 'aptos') && (
                      <span className="px-1 py-0 text-[8px] bg-orange-500/20 text-orange-400 rounded-full font-rubik-medium leading-tight border border-orange-500/30">
                        Coming Soon
                      </span>
                    )}
                    {!chain.isSmartAccount && (chain.capabilities?.walletConnect || chain.type === 'aptos') && (
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
    {showList && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={() => setShowList(false)}
      >
        <div
          className="relative w-full max-w-2xl max-h-[90vh] bg-[#292828] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/10">
            <h2 className="text-white text-xl md:text-2xl font-rubik-bold">
              All Available Networks
            </h2>
            <button
              onClick={() => setShowList(false)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {groupedChains.map(([groupName, chains]) => (
              <div key={groupName} className="space-y-3">
                <h3 className="text-white/60 text-xs font-rubik-medium uppercase tracking-wider px-2">
                  {groupName}
                </h3>
                <div className="space-y-2">
                  {chains.map((chain) => {
                    const isSelected = selectedChainId === chain.id;
                    const Icon = chain.icon;

                    return (
                      <button
                        key={chain.id}
                        onClick={() => handleChainSelect(chain.id)}
                        className={cn(
                          'w-full flex items-center gap-4 p-4 rounded-2xl transition-all',
                          'hover:bg-white/5 hover:scale-[1.02] active:scale-[0.98]',
                          isSelected
                            ? 'bg-white/10 border-2 border-white/20 shadow-lg'
                            : 'bg-white/5 border-2 border-transparent'
                        )}
                      >
                        {/* Chain Icon */}
                        <div className="relative flex-shrink-0">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center"
                            style={{
                              backgroundColor: chain.color
                                ? `${chain.color}20`
                                : 'rgba(255, 255, 255, 0.1)',
                            }}
                          >
                            <Icon
                              className="w-8 h-8"
                              style={{
                                fill: 'currentColor',
                                color: chain.color || '#ffffff',
                              }}
                            />
                          </div>
                          {isSelected && (
                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#292828] flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full" />
                            </div>
                          )}
                        </div>

                        {/* Chain Info */}
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2 mb-1 min-h-[24px] flex-wrap">
                            <h4 className="text-white font-rubik-bold text-base truncate">
                              {chain.name}
                            </h4>
                            {chain.isTestnet && (
                              <span className="px-2 py-0.5 text-[10px] bg-yellow-500/20 text-yellow-400 rounded-full font-rubik-medium leading-tight whitespace-nowrap">
                                Testnet
                              </span>
                            )}
                            {chain.isSmartAccount && (
                              <span className="px-2 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded-full font-rubik-medium leading-tight whitespace-nowrap">
                                Gasless
                              </span>
                            )}
                            {(!chain.capabilities?.walletConnect && chain.type !== 'aptos') && (
                              <span className="px-2 py-0.5 text-[8px] bg-orange-500/20 text-orange-400 rounded-full font-rubik-medium leading-tight whitespace-nowrap border border-orange-500/30">
                                Coming Soon
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-white/60 text-sm font-rubik-normal">
                              {chain.symbol}
                            </p>
                            {chain.description && (
                              <>
                                <span className="text-white/30">•</span>
                                <p className="text-white/50 text-xs font-rubik-normal truncate">
                                  {chain.description}
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Selection Indicator */}
                        {isSelected && (
                          <div className="flex-shrink-0">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 bg-white/5">
            <p className="text-white/40 text-xs text-center font-rubik-normal">
              {allChains.length} networks available
            </p>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
