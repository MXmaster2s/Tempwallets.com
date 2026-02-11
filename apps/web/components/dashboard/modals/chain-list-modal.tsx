'use client';

import { useMemo, useEffect } from 'react';
import { X, CircleHelp } from 'lucide-react';
import { useWalletConfig } from '@/hooks/useWalletConfig';
import { cn } from '@repo/ui/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@repo/ui/components/ui/dialog";

// We need to replicate the logic for filtering/grouping chains inside the modal
// to ensure it matches the original ChainSelector exactly.

interface ChainListModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (chainId: string) => void;
    selectedChainId: string;
    modalOverlayClassName?: string;
}

export function ChainListModal({ isOpen, onClose, onSelect, selectedChainId, modalOverlayClassName }: ChainListModalProps) {
    const walletConfig = useWalletConfig();

    // Logic copied from ChainSelector to ensure consistent list
    const allChains = useMemo(() => {
        const isDev = walletConfig.isDev;
        return walletConfig.getMainnet()
            .filter((config) => {
                if (config.isTestnet) return false;

                // Honor feature flags
                if (!config.features.showInWalletList) return false;

                // Remove "Coming Soon" chains (unless Aptos)
                if (!config.capabilities.walletConnect && config.type !== 'aptos') {
                    return false;
                }

                return true;
            })
            .sort((a, b) => {
                const aEnabled = isDev ? a.features.enabledInDev : a.features.enabledInProd;
                const bEnabled = isDev ? b.features.enabledInDev : b.features.enabledInProd;

                if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.name.localeCompare(b.name);
            });
    }, [walletConfig]);

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
            // Logic from ChainSelector
            if (chain.isSmartAccount) {
                groups['GASLESS CHAINS / EIP-7702']!.push(chain);
                if (['ethereumErc4337', 'baseErc4337', 'arbitrumErc4337'].includes(chain.id)) {
                    groups['COMPATIBLE LIGHTNING NODE WALLETS']!.push(chain);
                }
            } else if (chain.type === 'evm') {
                groups['EVM EOA WALLETS']!.push(chain);
            } else if (chain.type === 'substrate') {
                groups['Substrate']!.push(chain);
            } else if (chain.type === 'aptos') {
                groups['Aptos']!.push(chain);
            } else {
                groups['Other']!.push(chain);
            }
        });

        return Object.entries(groups).filter(([_, chains]) => chains.length > 0);
    }, [allChains]);

    // Dialog handles scroll locking automatically

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                overlayClassName={modalOverlayClassName}
                className="w-[90%] sm:w-full sm:max-w-[340px] md:max-w-[380px] max-h-[85vh] bg-black/90 backdrop-blur border border-white/10 rounded-2xl shadow-2xl overflow-hidden p-0 gap-0"
            >
                {/* Header */}
                <DialogHeader className="flex flex-row items-center justify-between p-4 border-b border-white/10 space-y-0">
                    <DialogTitle className="text-white text-lg font-rubik-bold">
                        All Networks
                    </DialogTitle>
                    {/* DialogContent usually includes a Close button, but we can keep our custom one or rely on default. 
                        Shadcn default Close is absolute. We'll use ours for consistency given the complex header. 
                        Actually, Shadcn DialogContent has a Close primitive. We should probably hide it or use it. 
                        For now, retaining custom header structure. */}
                </DialogHeader>

                {/* Scrollable List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[60vh]">
                    {groupedChains.map(([groupName, chains]) => (
                        <div key={groupName} className="space-y-2">
                            <div className="flex items-center gap-1.5 px-1">
                                <h3 className="text-white/50 text-[10px] font-rubik-medium uppercase tracking-wider">
                                    {groupName}
                                </h3>
                                {['GASLESS CHAINS / EIP-7702', 'EVM EOA WALLETS', 'COMPATIBLE LIGHTNING NODE WALLETS'].includes(groupName) && (
                                    <a
                                        href="https://medium.com/@tempwallets/what-are-these-different-wallets-i-see-in-my-account-explained-60b01cbd60c5"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-white/30 hover:text-white/50 transition-colors"
                                    >
                                        <CircleHelp className="w-3 h-3" />
                                    </a>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {chains.map((chain) => {
                                    const isSelected = selectedChainId === chain.id;
                                    const Icon = chain.icon;

                                    return (
                                        <button
                                            key={`${groupName}-${chain.id}`}
                                            onClick={() => {
                                                onSelect(chain.id);
                                                onClose();
                                            }}
                                            className={cn(
                                                'flex flex-col items-center justify-center p-2 rounded-xl transition-all aspect-square relative overflow-hidden',
                                                'hover:bg-white/5 hover:scale-[1.02] active:scale-[0.98]',
                                                isSelected
                                                    ? 'bg-white/10 border border-white/20 shadow-lg'
                                                    : 'bg-white/5 border border-transparent'
                                            )}
                                        >
                                            {/* Chain Icon */}
                                            <div
                                                className="w-8 h-8 rounded-full flex items-center justify-center mb-1.5"
                                                style={{
                                                    backgroundColor: chain.color
                                                        ? `${chain.color}20`
                                                        : 'rgba(255, 255, 255, 0.1)',
                                                }}
                                            >
                                                <Icon
                                                    className="w-4 h-4"
                                                    style={{
                                                        fill: 'currentColor',
                                                        color: chain.color || '#ffffff',
                                                    }}
                                                />
                                            </div>

                                            {/* Short Name (Symbol) */}
                                            <span className="text-white font-rubik-bold text-xs mb-0.5 uppercase tracking-wide">
                                                {chain.symbol}
                                            </span>

                                            {/* Full Name */}
                                            <span className="text-[10px] text-white/50 font-rubik-normal mb-1">
                                                {chain.name}
                                            </span>

                                            {/* Wallet Type Badge */}
                                            <div className="mt-auto scale-90 origin-bottom">
                                                {chain.isSmartAccount ? (
                                                    <span className="px-1.5 py-0.5 text-[9px] bg-blue-500/20 text-blue-300 rounded-full font-rubik-medium border border-blue-500/20">
                                                        7702
                                                    </span>
                                                ) : chain.type === 'evm' ? (
                                                    <span className="px-1.5 py-0.5 text-[9px] bg-purple-500/20 text-purple-300 rounded-full font-rubik-medium border border-purple-500/20">
                                                        EOA
                                                    </span>
                                                ) : chain.type === 'aptos' ? (
                                                    <span className="px-1.5 py-0.5 text-[9px] bg-teal-500/20 text-teal-300 rounded-full font-rubik-medium border border-teal-500/20">
                                                        Aptos
                                                    </span>
                                                ) : (
                                                    <span className="px-1.5 py-0.5 text-[9px] bg-gray-500/20 text-gray-400 rounded-full font-rubik-medium border border-gray-500/20">
                                                        {chain.type}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Selection Checkmark (Absolute Top Right) */}
                                            {isSelected && (
                                                <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-green-500 rounded-full shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-white/10 bg-white/5">
                    <p className="text-white/30 text-[10px] text-center font-rubik-normal">
                        {allChains.length} networks
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
