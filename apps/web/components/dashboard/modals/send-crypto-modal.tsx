"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/components/ui/select";
import { ChainListModal } from '@/components/dashboard/modals/chain-list-modal';
import { Label } from "@repo/ui/components/ui/label";
import { Loader2, AlertCircle, CheckCircle2, ExternalLink, Clipboard } from "lucide-react";
import { walletApi, TokenBalance, ApiError, AnyChainAsset } from "@/lib/api";
import { useTokenIcon } from "@/lib/token-icons";
import { trackTransaction } from "@/lib/tempwallets-analytics";
import { useWalletConfig } from "@/hooks/useWalletConfig";
import { ChevronDown, Check } from "lucide-react";
import Image from "next/image";
import { chains } from "@/lib/chains";

interface SendCryptoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chain: string;
  userId: string;
  onSuccess?: () => void;
  initialTokenSymbol?: string;
}

// Clean chain names (without technical suffixes)
const CHAIN_NAMES: Record<string, string> = {
  ethereum: "Ethereum",
  tron: "Tron",
  bitcoin: "Bitcoin",
  solana: "Solana",
  // EOA chains
  base: "Base",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  avalanche: "Avalanche",
  // Polkadot EVM Compatible chains
  moonbeamTestnet: "Moonbeam Testnet",
  astarShibuya: "Astar Shibuya",
  paseoPassetHub: "Paseo PassetHub",
  // Substrate/Polkadot chains
  polkadot: "Polkadot",
  hydrationSubstrate: "Hydration",
  bifrostSubstrate: "Bifrost",
  uniqueSubstrate: "Unique",
  paseo: "Paseo",
  paseoAssethub: "Paseo AssetHub",
  // Aptos chains
  aptos: "Aptos",
  aptosTestnet: "Aptos Testnet",
  // EIP-7702 Gasless chains
  ethereumGasless: "Ethereum",
  baseGasless: "Base",
  arbitrumGasless: "Arbitrum",
  optimismGasless: "Optimism",
  polygonGasless: "Polygon",
  sepoliaGasless: "Sepolia",
  baseSepoliaGasless: "Base Sepolia",
};

// EIP-7702 chain ID mapping
// ✅ FIX: Include both base chain names and ERC4337 variants
const EIP7702_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  baseErc4337: 8453, // ✅ Add ERC4337 variant
  arbitrum: 42161,
  arbitrumErc4337: 42161, // ✅ Add ERC4337 variant
  optimism: 10,
  polygon: 137,
  polygonErc4337: 137, // ✅ Add ERC4337 variant
  avalanche: 43114,
  avalancheErc4337: 43114, // ✅ Add ERC4337 variant
  // Only chains confirmed for EIP-7702 gasless flow
  sepolia: 11155111,
};

// ✅ FIX: Check both direct chain name and normalized version
const isEip7702Chain = (chain: string): boolean => {
  // Direct check
  if (chain in EIP7702_CHAIN_IDS) return true;

  // Normalize chain name (remove Erc4337 suffix for base chains)
  const normalized = chain.replace(/Erc4337$/i, '').toLowerCase();
  return normalized in EIP7702_CHAIN_IDS;
};

// Address validation per chain type
const validateAddress = (address: string, chain: string): string | null => {
  if (!address || address.trim().length === 0) {
    return "Recipient address is required";
  }

  const trimmed = address.trim();

  const evmChains = [
    "ethereum", "base", "arbitrum", "polygon", "avalanche",
    "optimism", "sepolia",
  ];
  if (evmChains.includes(chain)) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      return "Invalid Ethereum address format (must start with 0x and be 42 characters)";
    }
  }

  // Tron
  if (chain === "tron") {
    if (!/^T[A-Za-z1-9]{33}$/.test(trimmed)) {
      return "Invalid Tron address format (must start with T and be 34 characters)";
    }
  }

  // Bitcoin
  if (chain === "bitcoin") {
    if (!/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/.test(trimmed)) {
      return "Invalid Bitcoin address format";
    }
  }

  // Solana
  if (chain === "solana") {
    if (trimmed.length < 32 || trimmed.length > 44) {
      return "Invalid Solana address format (must be 32-44 characters)";
    }
  }

  // Substrate/Polkadot chains (SS58 format)
  const SUBSTRATE_CHAINS = ["polkadot", "hydrationSubstrate", "bifrostSubstrate", "uniqueSubstrate", "paseo", "paseoAssethub"];
  if (SUBSTRATE_CHAINS.includes(chain)) {
    // SS58 addresses are typically 48 characters, but can vary
    // Basic validation: should be alphanumeric and reasonable length
    if (trimmed.length < 32 || trimmed.length > 50 || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
      return "Invalid Substrate address format (SS58 encoded, typically 32-50 characters)";
    }
  }

  // Aptos chains (0x-prefixed hex, 64 characters)
  if (chain === "aptos" || chain === "aptosTestnet") {
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
      return "Invalid Aptos address format (must start with 0x and be 66 characters)";
    }
  }

  return null;
};

/**
 * Format transaction hash for block explorer
 * Substrate chains need hash without 0x prefix for Subscan
 */
const formatTxHashForExplorer = (hash: string, isSubstrate: boolean = false): string => {
  if (!hash) return '';
  // Remove 0x prefix for Substrate chains (Subscan expects it without prefix)
  if (isSubstrate && hash.startsWith('0x')) {
    return hash.slice(2);
  }
  return hash;
};

const getExplorerUrl = (txHash: string, chain: string): string => {
  if (!txHash) return '#';

  // Determine if this is a testnet chain
  const isTestnet = chain === 'paseo' || chain === 'paseoAssethub' ||
    chain === 'moonbeamTestnet' || chain === 'astarShibuya' ||
    chain === 'paseoPassetHub';

  // EVM chains (testnet support)
  const evmExplorers: Record<string, { mainnet: string; testnet?: string }> = {
    ethereum: { mainnet: 'https://etherscan.io', testnet: 'https://sepolia.etherscan.io' },
    base: { mainnet: 'https://basescan.org', testnet: 'https://sepolia.basescan.org' },
    arbitrum: { mainnet: 'https://arbiscan.io', testnet: 'https://sepolia.arbiscan.io' },
    polygon: { mainnet: 'https://polygonscan.com', testnet: 'https://mumbai.polygonscan.com' },
    avalanche: { mainnet: 'https://snowtrace.io', testnet: 'https://testnet.snowtrace.io' },
    moonbeamTestnet: { mainnet: 'https://moonscan.io', testnet: 'https://moonbase.moonscan.io' },
    astarShibuya: { mainnet: 'https://astar.subscan.io', testnet: 'https://shibuya.subscan.io' },
    paseoPassetHub: { mainnet: 'https://assethub-polkadot.subscan.io', testnet: 'https://assethub-paseo.subscan.io' },
  };

  // Check if it's an EVM chain
  const evmChain = chain;
  if (evmExplorers[evmChain]) {
    const explorer = isTestnet && evmExplorers[evmChain].testnet
      ? evmExplorers[evmChain].testnet
      : evmExplorers[evmChain].mainnet;
    return `${explorer}/tx/${txHash}`;
  }

  // Non-EVM chains
  const nonEvmExplorers: Record<string, string> = {
    tron: `https://tronscan.org/#/transaction/${txHash}`,
    bitcoin: `https://blockstream.info/tx/${txHash}`,
    solana: `https://solscan.io/tx/${txHash}`,
    aptos: `https://explorer.aptoslabs.com/?network=mainnet&transaction=${txHash}`,
    aptosTestnet: `https://explorer.aptoslabs.com/?network=testnet&transaction=${txHash}`,
  };

  if (nonEvmExplorers[chain]) {
    return nonEvmExplorers[chain];
  }

  // Substrate/Polkadot chains - use Subscan
  const substrateExplorers: Record<string, { mainnet: string; testnet: string }> = {
    polkadot: {
      mainnet: 'https://polkadot.subscan.io',
      testnet: 'https://paseo.subscan.io'
    },
    hydrationSubstrate: {
      mainnet: 'https://hydradx.subscan.io',
      testnet: 'https://hydradx-testnet.subscan.io'
    },
    bifrostSubstrate: {
      mainnet: 'https://bifrost.subscan.io',
      testnet: 'https://bifrost-testnet.subscan.io'
    },
    uniqueSubstrate: {
      mainnet: 'https://unique.subscan.io',
      testnet: 'https://unique-testnet.subscan.io'
    },
    paseo: {
      mainnet: 'https://paseo.subscan.io',
      testnet: 'https://paseo.subscan.io'
    },
    paseoAssethub: {
      mainnet: 'https://assethub-polkadot.subscan.io',
      testnet: 'https://assethub-paseo.subscan.io'
    },
  };

  if (substrateExplorers[chain]) {
    const explorer = isTestnet ? substrateExplorers[chain].testnet : substrateExplorers[chain].mainnet;
    const formattedHash = formatTxHashForExplorer(txHash, true);
    return `${explorer}/extrinsic/${formattedHash}`;
  }

  return '#';
};

// Component to render selected token in trigger with network icon
interface SelectedTokenDisplayProps {
  token: TokenBalance;
}

function SelectedTokenDisplay({ token }: SelectedTokenDisplayProps) {
  const NetworkIcon = useTokenIcon(token.chain || 'ethereum');

  // Format balance
  const formatBalance = (balance: string, decimals: number): string => {
    const num = parseFloat(balance);
    if (isNaN(num)) return "0";
    return (num / Math.pow(10, decimals)).toFixed(6).replace(/\.?0+$/, "");
  };

  return (
    <div className="flex items-center gap-2">
      <NetworkIcon className="h-4 w-4 flex-shrink-0" />
      <span>
        {token.symbol} - {formatBalance(token.balance, token.decimals)}
      </span>
    </div>
  );
}

// Component to render token with network icon in dropdown
interface TokenSelectItemProps {
  value: string;
  token: TokenBalance;
}

function TokenSelectItem({ value, token }: TokenSelectItemProps) {
  const NetworkIcon = useTokenIcon(token.chain || 'ethereum');

  // Format balance
  const formatBalance = (balance: string, decimals: number): string => {
    const num = parseFloat(balance);
    if (isNaN(num)) return "0";
    return (num / Math.pow(10, decimals)).toFixed(6).replace(/\.?0+$/, "");
  };

  return (
    <SelectItem
      value={value}
      className="text-sm focus:bg-white/10 focus:text-white"
    >
      <div className="flex items-center gap-2">
        <NetworkIcon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">
          {token.symbol} - {formatBalance(token.balance, token.decimals)}
        </span>
      </div>
    </SelectItem>
  );
}

export function SendCryptoModal({ open, onOpenChange, chain, userId, onSuccess, initialTokenSymbol }: SendCryptoModalProps) {
  // Get chain icon
  // Determine the active chain (starts with prop, but can change)
  const [currentChainId, setCurrentChainId] = useState(chain);
  const walletConfig = useWalletConfig();
  const visibleChains = walletConfig.getVisible();

  // Get current chain config
  const CurrentChainIcon = useTokenIcon(currentChainId);
  const currentChainName = CHAIN_NAMES[currentChainId] || currentChainId;

  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [amount, setAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; address?: string }>({});
  const [txHash, setTxHash] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isChainDropdownOpen, setIsChainDropdownOpen] = useState(false);

  // Helper for chain data with robust fallback for logos
  const rawChainData = chains.find(c => c.id === currentChainId);
  const chainData = rawChainData || chains.find(c => {
    const id = c.id.toLowerCase();
    const current = currentChainId.toLowerCase();
    if (current.includes('ethereum') && id === 'ethereum') return true;
    if (current.includes('base') && id === 'base') return true;
    if (current.includes('arbitrum') && id === 'arbitrum') return true;
    if (current.includes('optimism') && id === 'optimism') return true;
    if (current.includes('polygon') && id === 'polygon') return true;
    if (current.includes('avalanche') && id === 'avalanche') return true;
    return false;
  }) || chains[0];

  const handleChainChange = (newChainId: string) => {
    setCurrentChainId(newChainId);
  };

  const loadTokens = useCallback(async (chainIdToLoad: string) => {
    setLoadingTokens(true);
    setError(null);
    try {
      // Check if this is a Substrate chain
      const SUBSTRATE_CHAINS = ["polkadot", "hydrationSubstrate", "bifrostSubstrate", "uniqueSubstrate", "paseo", "paseoAssethub"];
      const isSubstrate = SUBSTRATE_CHAINS.includes(chainIdToLoad);

      // Check if this is an Aptos chain
      const APTOS_CHAINS = ["aptos", "aptosTestnet"];
      const isAptos = APTOS_CHAINS.includes(chainIdToLoad);

      if (isSubstrate) {
        // Load Substrate balances
        const balances = await walletApi.getSubstrateBalances(userId, false);
        const chainBalance = balances[chainIdToLoad];

        if (chainBalance && chainBalance.address) {
          // Create a single token entry for native Substrate token
          const tokenList: TokenBalance[] = [{
            address: null, // Native token
            symbol: chainBalance.token,
            balance: chainBalance.balance,
            decimals: chainBalance.decimals,
            chain: chainIdToLoad, // ✅ FIX: Add chain property for Substrate tokens
          }];
          setTokens(tokenList);
          setSelectedToken(tokenList[0] ?? null);
        } else {
          setTokens([]);
          setError("No address found for this Substrate chain");
        }
      } else if (isAptos) {
        // Load Aptos balance
        const network = chainIdToLoad === "aptosTestnet" ? "testnet" : "mainnet";
        const balanceData = await walletApi.getAptosBalance(userId, network);

        // Create a single token entry for native APT token
        // ✅ FIX: Backend returns balance in human-readable APT, convert to octas (smallest units)
        const tokenList: TokenBalance[] = [{
          address: null, // Native token
          symbol: "APT",
          balance: (parseFloat(balanceData.balance) * Math.pow(10, 8)).toString(), // Convert APT to octas (8 decimals)
          decimals: 8,
          chain: chainIdToLoad, // ✅ FIX: Add chain property for Aptos tokens
        }];
        setTokens(tokenList);
        setSelectedToken(tokenList[0] ?? null);
      } else {
        // ✅ FIX: Use getAssetsAny to get all chain assets from Zerion (primary balance source)
        // Strip 'Gasless' suffix if present for backend compatibility
        let targetChain = chainIdToLoad;
        if (chainIdToLoad.endsWith('Gasless')) {
          // Map gasless IDs to underlying chain IDs for token fetching
          if (chainIdToLoad === 'ethereumGasless') targetChain = 'ethereum';
          else if (chainIdToLoad === 'baseGasless') targetChain = 'base';
          else if (chainIdToLoad === 'arbitrumGasless') targetChain = 'arbitrum';
          else if (chainIdToLoad === 'optimismGasless') targetChain = 'optimism';
          else if (chainIdToLoad === 'polygonGasless') targetChain = 'polygon';
        }

        // ✅ FIX: Use getAssetsAny instead of getTokenBalances to match balance-view data source
        const allAssets = await walletApi.getAssetsAny(userId, true);
        
        // ✅ FIX: Filter assets for the target chain and map to TokenBalance format
        const tokenList: TokenBalance[] = allAssets
          .filter(asset => asset.chain === targetChain)
          .map(asset => ({
            address: asset.address ?? null,
            symbol: asset.symbol || 'UNKNOWN',
            balance: asset.balance || '0',
            decimals: asset.decimals ?? 18, // Default to 18 for EVM tokens
            chain: asset.chain, // ✅ FIX: Preserve chain property from asset
          }));

        // Sort: Native first, then alphabetical
        tokenList.sort((a, b) => {
          if (a.address === null && b.address !== null) return -1;
          if (a.address !== null && b.address === null) return 1;
          return a.symbol.localeCompare(b.symbol);
        });

        setTokens(tokenList);
        if (tokenList.length > 0) {
          // Select first token (native token) by default OR pre-selected
          if (initialTokenSymbol) {
            const preSelected = tokenList.find(t => t.symbol.toLowerCase() === initialTokenSymbol.toLowerCase());
            if (preSelected) {
              setSelectedToken(preSelected);
            } else {
              setSelectedToken(tokenList[0] ?? null);
            }
          } else {
            setSelectedToken(tokenList[0] ?? null);
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load tokens, falling back to native token", err);
      // Fallback: If API fails (e.g. timeout), show at least the native token for the chain
      // so the UI is usable.
      
      // ✅ FIX: Determine the correct chain name for fallback
      let fallbackChain = chainIdToLoad;
      if (chainIdToLoad.endsWith('Gasless')) {
        if (chainIdToLoad === 'ethereumGasless') fallbackChain = 'ethereum';
        else if (chainIdToLoad === 'baseGasless') fallbackChain = 'base';
        else if (chainIdToLoad === 'arbitrumGasless') fallbackChain = 'arbitrum';
        else if (chainIdToLoad === 'optimismGasless') fallbackChain = 'optimism';
        else if (chainIdToLoad === 'polygonGasless') fallbackChain = 'polygon';
      }
      
      const fallbackToken: TokenBalance = {
        address: null,
        symbol: chainData?.symbol || 'ETH',
        balance: '0',
        decimals: 18,
        chain: fallbackChain // ✅ FIX: Use mapped chain name, not gasless variant
      };
      setTokens([fallbackToken]);
      setSelectedToken(fallbackToken);
      setError(null); // Clear error to show UI
    } finally {
      setLoadingTokens(false);
    }
  }, [userId, initialTokenSymbol, chainData]);

  // Load tokens when modal opens OR chain changes
  useEffect(() => {
    if (open && userId && currentChainId) {
      loadTokens(currentChainId);
    } else {
      // Reset state when modal closes
      setTokens([]);
      setSelectedToken(null);
      setAmount("");
      setRecipientAddress("");
      setError(null);
      setFieldErrors({});
      setTxHash(null);
      setSuccess(false);
      // Reset chain to prop when closed
      if (!open) {
        setCurrentChainId(chain);
      }
    }
  }, [open, userId, currentChainId, loadTokens, chain]);

  const validateForm = (): boolean => {
    const errors: { amount?: string; address?: string } = {};

    // Validate amount
    if (!amount || amount.trim().length === 0) {
      errors.amount = "Amount is required";
    } else {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        errors.amount = "Amount must be a positive number";
      } else if (selectedToken) {
        // Convert balance from smallest units using actual token decimals
        const available = parseFloat(selectedToken.balance) / Math.pow(10, selectedToken.decimals);
        if (amountNum > available) {
          errors.amount = `Insufficient balance. Available: ${formatBalance(selectedToken.balance, selectedToken.decimals)} ${selectedToken.symbol}`;
        }
      }
    }

    // Validate recipient address
    const addressError = validateAddress(recipientAddress, currentChainId);
    if (addressError) {
      errors.address = addressError;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Convert balance from smallest units to human-readable using actual token decimals
  const formatBalance = (balance: string, decimals: number): string => {
    const num = parseFloat(balance);
    if (isNaN(num)) return "0";
    return (num / Math.pow(10, decimals)).toFixed(6).replace(/\.?0+$/, "");
  };

  // Handle pasting from clipboard
  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setRecipientAddress(text.trim());
        // Clear any existing address errors when pasting
        if (fieldErrors.address) {
          setFieldErrors({ ...fieldErrors, address: undefined });
        }
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      setError('Failed to read clipboard. Please paste manually.');
    }
  };

  const handleSend = async () => {
    if (!validateForm() || !selectedToken) {
      return;
    }

    // CRITICAL: Validate that Zerion provided decimals for this token
    if (selectedToken.decimals === undefined || selectedToken.decimals === null) {
      setError(
        `Token data incomplete: ${selectedToken.symbol} is missing decimals information from Zerion. ` +
        `Please try refreshing your wallet data or contact support.`
      );
      return;
    }

    // Validate decimals are in valid range
    if (selectedToken.decimals < 0 || selectedToken.decimals > 36) {
      setError(
        `Invalid token decimals: ${selectedToken.decimals}. Decimals must be between 0 and 36.`
      );
      return;
    }

    // Validate that token has chain information
    if (!selectedToken.chain) {
      setError(
        `Token data incomplete: ${selectedToken.symbol} is missing chain information. ` +
        `Please try refreshing your wallet data or contact support.`
      );
      return;
    }

    // Track send button click (already tracked in wallet-info, but track here too for modal context)
    trackTransaction.sendClicked();

    setLoading(true);
    setError(null);

    try {
      // Use the selected token's chain, not the modal's chain prop
      const tokenChain = selectedToken.chain || currentChainId;

      // Log token send details for debugging
      console.log('[Send Debug] Sending token:', {
        symbol: selectedToken.symbol,
        address: selectedToken.address,
        decimals: selectedToken.decimals,
        amount: amount,
        tokenChain: tokenChain,
        modalChain: currentChainId,
      });

      // 🔍 DETAILED CHAIN DETECTION DEBUG
      console.log('🔍 [Chain Detection] Avalanche EIP-7702 Check:', {
        selectedTokenChain: selectedToken.chain,
        modalChain: currentChainId,
        finalTokenChain: tokenChain,
        isInEIP7702Mapping: tokenChain in EIP7702_CHAIN_IDS,
        chainIdFromMapping: EIP7702_CHAIN_IDS[tokenChain],
        allEIP7702Chains: Object.keys(EIP7702_CHAIN_IDS),
      });

      // Check if this is a Substrate chain
      const SUBSTRATE_CHAINS = ["polkadot", "hydrationSubstrate", "bifrostSubstrate", "uniqueSubstrate", "paseo", "paseoAssethub"];
      const isSubstrate = SUBSTRATE_CHAINS.includes(tokenChain);

      // Check if this is an Aptos chain
      const APTOS_CHAINS = ["aptos", "aptosTestnet"];
      const isAptos = APTOS_CHAINS.includes(tokenChain);

      // ✅ FIX: Check if this is an EIP-7702 gasless chain
      // Normalize chain name first (handle both 'base' and 'baseErc4337')
      const normalizedChain = tokenChain.replace(/Erc4337$/i, '').toLowerCase();
      const isGasless = isEip7702Chain(normalizedChain) || isEip7702Chain(tokenChain);

      // 🔍 LOG WHICH ENDPOINT WILL BE USED
      if (isGasless) {
        const chainId = EIP7702_CHAIN_IDS[normalizedChain] || EIP7702_CHAIN_IDS[tokenChain];
        console.log('✅ [Endpoint] Using EIP-7702 gasless endpoint (/wallet/eip7702/send)');
        console.log('✅ [ChainID]', chainId, `(from ${normalizedChain} or ${tokenChain})`);
      } else if (isSubstrate) {
        console.log('ℹ️ [Endpoint] Using Substrate endpoint');
      } else if (isAptos) {
        console.log('ℹ️ [Endpoint] Using Aptos endpoint');
      } else {
        console.log('⚠️ [Endpoint] Using regular sendCrypto endpoint (/wallet/send)');
        console.log('⚠️ [Reason] isGasless =', isGasless, ', tokenChain =', tokenChain);
      }

      let result: { txHash: string; userOpHash?: string; explorerUrl?: string; isFirstTransaction?: boolean };

      if (isGasless) {
        // ✅ FIX: Use EIP-7702 gasless endpoint
        // Try both normalized and original chain name
        const chainId = EIP7702_CHAIN_IDS[normalizedChain] || EIP7702_CHAIN_IDS[tokenChain];
        if (!chainId) {
          throw new Error(
            `Chain ID not found for ${tokenChain} (normalized: ${normalizedChain}). ` +
            `Available chains: ${Object.keys(EIP7702_CHAIN_IDS).join(', ')}`
          );
        }

        const gaslessResult = await walletApi.sendEip7702Gasless({
          userId,
          chainId,
          recipientAddress: recipientAddress.trim(),
          amount: amount, // Human-readable amount
          tokenAddress: selectedToken.address || undefined,
          tokenDecimals: selectedToken.decimals, // Always pass decimals from Zerion (validated above)
        });

        // Use transactionHash if available, otherwise use userOpHash
        result = {
          txHash: gaslessResult.transactionHash || gaslessResult.userOpHash,
          userOpHash: gaslessResult.userOpHash,
          explorerUrl: gaslessResult.explorerUrl,
          isFirstTransaction: gaslessResult.isFirstTransaction,
        };

        // If we only have userOpHash, wait for confirmation to get txHash
        if (!gaslessResult.transactionHash && gaslessResult.userOpHash) {
          try {
            const confirmResult = await walletApi.waitEip7702Confirmation({
              chainId,
              userOpHash: gaslessResult.userOpHash,
              timeoutMs: 60000,
            });
            result.txHash = confirmResult.transactionHash;
            result.explorerUrl = confirmResult.explorerUrl;
          } catch (waitError) {
            // Even if waiting fails, show the userOpHash
            console.warn('Failed to wait for confirmation:', waitError);
          }
        }
      } else if (isSubstrate) {
        // Convert human-readable amount to smallest units for Substrate
        const amountInSmallestUnits = (parseFloat(amount) * Math.pow(10, selectedToken.decimals)).toString();

        // Use Substrate send endpoint
        const substrateResult = await walletApi.sendSubstrateTransfer({
          userId,
          chain: tokenChain, // Use token's chain
          to: recipientAddress.trim(),
          amount: amountInSmallestUnits, // Amount in smallest units
          useTestnet: false, // TODO: Add testnet toggle if needed
          transferMethod: 'transferAllowDeath', // Default transfer method
        });

        result = { txHash: substrateResult.txHash };
      } else if (isAptos) {
        // Use Aptos send endpoint
        const network = tokenChain === "aptosTestnet" ? "testnet" : "mainnet"; // Use token's chain
        const aptosResult = await walletApi.sendAptosTransaction({
          userId,
          recipientAddress: recipientAddress.trim(),
          amount: parseFloat(amount), // Amount in APT (human-readable)
          network,
        });
        result = { txHash: aptosResult.transactionHash };
      } else {
        // Use regular EVM/other chain send endpoint
        const sendResult = await walletApi.sendCrypto({
          userId,
          chain: tokenChain, // Use token's chain, not modal's chain prop
          tokenAddress: selectedToken.address || undefined,
          tokenDecimals: selectedToken.decimals,
          amount: amount, // human-readable amount; server converts using ERC-20 decimals / Zerion
          recipientAddress: recipientAddress.trim(),
        });
        result = { txHash: sendResult.txHash };
      }

      setTxHash(result.txHash);
      setExplorerUrl(result.explorerUrl || null);
      setSuccess(true);

      // Track successful send transaction
      trackTransaction.sendCompleted(
        result.txHash,
        amount,
        selectedToken.symbol,
        tokenChain, // Use token's chain for analytics
      );

      // Call onSuccess callback after a short delay
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        }
        // Close modal after 3 seconds
        setTimeout(() => {
          onOpenChange(false);
        }, 3000);
      }, 1000);
    } catch (err) {
      let errorMessage = "Failed to send transaction. Please try again.";
      let errorCode: string | number | undefined;

      if (err instanceof ApiError) {
        errorMessage = err.message;
        errorCode = err.status;

        // Parse specific error codes
        if (err.status === 422) {
          // Insufficient balance
          if (err.message.includes("balance")) {
            setFieldErrors({ amount: err.message });
            errorMessage = "";
          } else {
            errorMessage = err.message;
          }
        } else if (err.status === 400) {
          // Invalid input
          if (err.message.includes("address")) {
            setFieldErrors({ address: err.message });
            errorMessage = "";
          } else if (err.message.includes("amount")) {
            setFieldErrors({ amount: err.message });
            errorMessage = "";
          } else {
            errorMessage = err.message;
          }
        } else if (err.status === 503 || err.status === 408) {
          errorMessage = "Network error. Please check your connection and try again.";
        }
      }

      // Track failed send transaction
      trackTransaction.sendFailed(
        errorMessage,
        errorCode,
      );

      if (errorMessage) {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };
  // Helper to strictly format chain names
  const formatChainName = (nameOrId: string) => {
    if (!nameOrId) return '';
    const lower = nameOrId.toLowerCase();
    // Strict mapping based on user request ("heading will be only Ethereum...")
    if (lower.includes('ethereum') || lower.includes('eth')) return 'Ethereum';
    if (lower.includes('bitcoin') || lower.includes('btc')) return 'Bitcoin';
    if (lower.includes('polkadot') || lower.includes('dot')) return 'Polkadot';
    if (lower.includes('base')) return 'Base';
    if (lower.includes('arbitrum')) return 'Arbitrum';
    if (lower.includes('optimism')) return 'Optimism';
    if (lower.includes('polygon') || lower.includes('matic')) return 'Polygon';
    if (lower.includes('solana') || lower.includes('sol')) return 'Solana';
    if (lower.includes('avalanche') || lower.includes('avax')) return 'Avalanche';
    if (lower.includes('tron') || lower.includes('trx')) return 'Tron';
    if (lower.includes('aptos')) return 'Aptos';

    // Generic cleanup
    return nameOrId
      .replace(/\s*\(Gasless\)/i, '')
      .replace(/Erc4337/i, '')
      .replace(/EOA/i, '')
      .trim();
  };

  // Helper component for Dropdown Items to correctly load icons using the hook
  function ChainDropdownItem({
    chainData,
    isSelected,
    onClick,
    formatName
  }: {
    chainData: typeof chains[0],
    isSelected: boolean,
    onClick: (id: string) => void,
    formatName: (name: string) => string
  }) {
    const Icon = useTokenIcon(chainData.id);

    return (
      <div
        onClick={() => onClick(chainData.id)}
        className="flex items-center gap-3 p-3 hover:bg-white/5 cursor-pointer focus:bg-white/5"
      >
        <div className="relative w-5 h-5 flex items-center justify-center">
          <Icon className="w-full h-full object-contain" />
        </div>
        <span className="text-sm font-medium">{formatName(chainData.name)}</span>
        {isSelected && (
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-black/90 text-white shadow-2xl backdrop-blur w-full max-w-[360px] p-0 rounded-2xl [&>button]:text-white [&>button]:hover:text-white [&>button]:hover:bg-white/20 [&>button]:opacity-100">
        <DialogHeader className="px-6 pt-5 pb-0">
          <div className="flex flex-col gap-3 mb-0">
            {/* Header Row: Icon, Name, Change Button */}
            <div className="flex items-center gap-2 w-full">
              <div className="relative w-7 h-7 rounded-full overflow-hidden bg-black p-1 flex items-center justify-center flex-shrink-0 border border-white/10">
                <CurrentChainIcon className="w-4 h-4 text-white" />
              </div>
              <DialogTitle className="text-lg font-semibold text-white tracking-tight truncate max-w-[200px]">
                {formatChainName(chainData?.name || chain)}
              </DialogTitle>

              {/* Change Button - Compact, right next to name */}
              <button
                onClick={() => setIsChainDropdownOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] font-bold text-gray-400 hover:text-white transition-colors uppercase tracking-wider flex-shrink-0"
              >
                Change
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
            {/* Sub-header text - Below the row */}
            <div className="text-xs text-gray-400 font-normal ml-1 text-left w-full">
              Transfer to recipient&apos;s address
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-6">
          {/* Token Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="token" className="text-xs font-medium text-white/80">Token</Label>
            {loadingTokens ? (
              <div className="flex items-center gap-2 text-xs text-white/60 py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </div>
            ) : tokens.length === 0 ? (
              <div className="text-xs text-red-400 py-2">
                No tokens available for this network from Zerion assets.
              </div>
            ) : (
              <Select
                value={selectedToken ? `${selectedToken.chain || 'unknown'}:${selectedToken.address || 'native'}` : undefined}
                onValueChange={(value) => {
                  const token = tokens.find(t => `${t.chain || 'unknown'}:${t.address || 'native'}` === value);
                  setSelectedToken(token ?? null);
                }}
              >
                <SelectTrigger id="token" className="h-9 rounded-xl border-white/20 bg-white/5 text-sm text-white hover:bg-white/10">
                  {selectedToken ? (
                    <SelectedTokenDisplay token={selectedToken} />
                  ) : (
                    <SelectValue placeholder="Select token" />
                  )}
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/20 bg-black/95 text-white">
                  {tokens.map((token) => {
                    const key = `${token.chain || 'unknown'}:${token.address || 'native'}`;
                    return (
                      <TokenSelectItem
                        key={key}
                        value={key}
                        token={token}
                      />
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Amount Input */}
          <div className="space-y-1.5">
            <Label htmlFor="amount" className="text-xs font-medium text-white/80">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="any"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (fieldErrors.amount) {
                  setFieldErrors({ ...fieldErrors, amount: undefined });
                }
              }}
              disabled={loading || !selectedToken}
              className="h-9 rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:ring-white/20"
            />
            {fieldErrors.amount ? (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.amount}
              </p>
            ) : selectedToken && (
              <p className="text-xs text-white/40">
                Available: {formatBalance(selectedToken.balance, selectedToken.decimals)} {selectedToken.symbol}
              </p>
            )}
          </div>

          {/* Recipient Address Input */}
          <div className="space-y-1.5">
            <Label htmlFor="recipient" className="text-xs font-medium text-white/80">Recipient</Label>
            <div className="relative">
              <Input
                id="recipient"
                placeholder="Enter address"
                value={recipientAddress}
                onChange={(e) => {
                  setRecipientAddress(e.target.value);
                  if (fieldErrors.address) {
                    setFieldErrors({ ...fieldErrors, address: undefined });
                  }
                }}
                disabled={loading}
                className="h-9 rounded-xl border-white/20 bg-white/5 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:ring-white/20 pr-10"
              />
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                disabled={loading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/10 hover:bg-white/20 disabled:bg-white/5 disabled:cursor-not-allowed rounded-lg transition-colors"
                title="Paste from clipboard"
              >
                <Clipboard className="h-4 w-4 text-white/70" />
              </button>
            </div>
            {fieldErrors.address && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.address}
              </p>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-2.5">
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            </div>
          )}

          {/* Success Display */}
          {success && txHash && (
            <div className="rounded-lg bg-green-500/10 border border-green-500/30 p-2.5">
              <p className="text-xs text-green-400 flex items-center gap-1.5 mb-1.5">
                <CheckCircle2 className="h-3 w-3" />
                Transaction sent!
              </p>
              <a
                href={explorerUrl || getExplorerUrl(txHash, chain)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/70 hover:text-white hover:underline flex items-center gap-1"
              >
                View explorer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="flex-1 h-9 text-sm rounded-full border-white/20 text-white hover:bg-white/10"
            >
              {success ? "Close" : "Cancel"}
            </Button>
            {!success && (
              <Button
                onClick={handleSend}
                disabled={loading || loadingTokens || !selectedToken}
                className="flex-1 h-9 text-sm rounded-full bg-white text-black hover:bg-white/90"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                    Sending
                  </>
                ) : (
                  "Send"
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
      <ChainListModal
        isOpen={isChainDropdownOpen}
        onClose={() => setIsChainDropdownOpen(false)}
        onSelect={handleChainChange}
        selectedChainId={chain}
        modalOverlayClassName="bg-transparent"
      />
    </Dialog>
  );
}
