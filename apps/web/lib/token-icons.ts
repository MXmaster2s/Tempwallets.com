import { ComponentType, SVGProps } from 'react';
import { useWalletConfig } from '@/hooks/useWalletConfig';
import Polkadot from '@thirdweb-dev/chain-icons/dist/polkadot-new';

/**
 * Fallback icon component (Polkadot as generic Substrate icon)
 */
const FallbackIcon: ComponentType<SVGProps<SVGSVGElement>> = Polkadot;

/**
 * Get token icon component for a chain
 * Uses wallet config to get chain icon from @thirdweb-dev/chain-icons
 * 
 * @param chain Chain ID (e.g., 'ethereum', 'polkadot', 'baseErc4337')
 * @param symbol Optional token symbol (currently not used, but reserved for future token-specific icons)
 * @returns React icon component (never null)
 */
export function getTokenIcon(
  chain: string,
  symbol?: string
): ComponentType<SVGProps<SVGSVGElement>> {
  // This is a helper function that can be used outside React components
  // For React components, use useTokenIcon hook instead
  // For now, return fallback - the hook will handle the actual lookup
  return FallbackIcon;
}

/**
 * Hook to get token icon component for a chain
 * Must be used inside React components
 * 
 * @param chain Chain ID (e.g., 'ethereum', 'polkadot', 'baseErc4337')
 * @param symbol Optional token symbol (currently not used, but reserved for future token-specific icons)
 * @returns React icon component (never null)
 */
export function useTokenIcon(
  chain: string,
  symbol?: string
): ComponentType<SVGProps<SVGSVGElement>> {
  const walletConfig = useWalletConfig();

  // Try to get chain config by ID
  const chainConfig = walletConfig.getById(chain);

  if (chainConfig?.icon) {
    return chainConfig.icon;
  }

  // Try mapping common chain name variations
  const chainMap: Record<string, string> = {
    // Map Zerion canonical IDs to wallet config IDs
    ethereum: 'ethereumErc4337',
    base: 'baseErc4337',
    arbitrum: 'arbitrumErc4337',
    polygon: 'polygonErc4337',
    avalanche: 'avalancheErc4337',
  };

  const mappedChain = chainMap[chain];
  if (mappedChain) {
    const mappedConfig = walletConfig.getById(mappedChain);
    if (mappedConfig?.icon) {
      return mappedConfig.icon;
    }
  }

  // Fallback to Polkadot icon (generic Substrate/chain icon)
  return FallbackIcon;
}

