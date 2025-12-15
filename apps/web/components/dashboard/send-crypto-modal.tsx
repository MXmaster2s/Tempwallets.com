"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Label } from "@repo/ui/components/ui/label";
import { Loader2, AlertCircle, CheckCircle2, ExternalLink, Zap, Clipboard } from "lucide-react";
import { walletApi, TokenBalance, ApiError, AnyChainAsset } from "@/lib/api";
import { useTokenIcon } from "@/lib/token-icons";
import { trackTransaction } from "@/lib/tempwallets-analytics";

interface SendCryptoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chain: string;
  userId: string;
  onSuccess?: () => void;
}

// Clean chain names (without technical suffixes)
const CHAIN_NAMES: Record<string, string> = {
  ethereum: "Ethereum",
  tron: "Tron",
  bitcoin: "Bitcoin",
  solana: "Solana",
  ethereumErc4337: "Ethereum",
  baseErc4337: "Base",
  arbitrumErc4337: "Arbitrum",
  polygonErc4337: "Polygon",
  base: "Base",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  avalancheErc4337: "Avalanche",
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
const EIP7702_CHAIN_IDS: Record<string, number> = {
  ethereumGasless: 1,
  baseGasless: 8453,
  arbitrumGasless: 42161,
  optimismGasless: 10,
  polygonGasless: 137,
  sepoliaGasless: 11155111,
  baseSepoliaGasless: 84532,
};

// Check if chain uses EIP-7702 gasless transactions
const isEip7702Chain = (chain: string): boolean => {
  return chain.endsWith('Gasless') && chain in EIP7702_CHAIN_IDS;
};

// Address validation per chain type
const validateAddress = (address: string, chain: string): string | null => {
  if (!address || address.trim().length === 0) {
    return "Recipient address is required";
  }

  const trimmed = address.trim();

  // EVM chains (Ethereum, ERC-4337 chains, Base/Arbitrum/Polygon EOAs, Gasless chains)
  const evmChains = [
    "ethereum", "ethereumErc4337", "base", "baseErc4337", "arbitrum", "arbitrumErc4337", 
    "polygon", "polygonErc4337", "avalanche", "avalancheErc4337",
    "ethereumGasless", "baseGasless", "arbitrumGasless", "optimismGasless", "polygonGasless",
    "sepoliaGasless", "baseSepoliaGasless"
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
  const evmChain = chain.replace('Erc4337', '');
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

// Map internal chain identifiers to Zerion canonical chain ids used by assets-any
const mapToZerionChain = (chain: string): string => {
  const m: Record<string, string> = {
    ethereum: 'ethereum',
    ethereumErc4337: 'ethereum',
    ethereumGasless: 'ethereum',
    sepoliaGasless: 'ethereum', // Sepolia testnet - fallback to ethereum for now
    base: 'base',
    baseErc4337: 'base',
    baseGasless: 'base',
    baseSepoliaGasless: 'base', // Base Sepolia testnet
    arbitrum: 'arbitrum',
    arbitrumErc4337: 'arbitrum',
    arbitrumGasless: 'arbitrum',
    optimismGasless: 'optimism',
    polygon: 'polygon',
    polygonErc4337: 'polygon',
    polygonGasless: 'polygon',
    solana: 'solana',
    avalanche: 'avalanche',
    avalancheErc4337: 'avalanche',
  };
  return m[chain] || chain;
};

export function SendCryptoModal({ open, onOpenChange, chain, userId, onSuccess }: SendCryptoModalProps) {
  // Get chain icon
  const ChainIcon = useTokenIcon(chain);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenBalance | null>(null);
  const [amount, setAmount] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; address?: string }>({});
  const [txHash, setTxHash] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadTokens = useCallback(async () => {
    setLoadingTokens(true);
    setError(null);
    try {
      // Check if this is a Substrate chain
      const SUBSTRATE_CHAINS = ["polkadot", "hydrationSubstrate", "bifrostSubstrate", "uniqueSubstrate", "paseo", "paseoAssethub"];
      const isSubstrate = SUBSTRATE_CHAINS.includes(chain);

      // Check if this is an Aptos chain
      const APTOS_CHAINS = ["aptos", "aptosTestnet"];
      const isAptos = APTOS_CHAINS.includes(chain);

      if (isSubstrate) {
        // Load Substrate balances
        const balances = await walletApi.getSubstrateBalances(userId, false);
        const chainBalance = balances[chain];
        
        if (chainBalance && chainBalance.address) {
          // Create a single token entry for native Substrate token
          const tokenList: TokenBalance[] = [{
            address: null, // Native token
            symbol: chainBalance.token,
            balance: chainBalance.balance,
            decimals: chainBalance.decimals,
          }];
          setTokens(tokenList);
          setSelectedToken(tokenList[0] ?? null);
        } else {
          setTokens([]);
          setError("No address found for this Substrate chain");
        }
      } else if (isAptos) {
        // Load Aptos balance
        const network = chain === "aptosTestnet" ? "testnet" : "mainnet";
        const balanceData = await walletApi.getAptosBalance(userId, network);
        
        // Create a single token entry for native APT token
        const tokenList: TokenBalance[] = [{
          address: null, // Native token
          symbol: "APT",
          balance: (parseFloat(balanceData.balance) * Math.pow(10, 8)).toString(), // Convert to octas (8 decimals)
          decimals: 8,
        }];
        setTokens(tokenList);
        setSelectedToken(tokenList[0] ?? null);
      } else {
        // Load aggregated assets once and filter for the selected chain
        const allAssets: AnyChainAsset[] = await walletApi.getAssetsAny(userId);
        const zChain = mapToZerionChain(chain);
        const filtered = allAssets.filter(a => a.chain === zChain);
        // Transform to TokenBalance shape with actual decimals from Zerion
        const tokenList: TokenBalance[] = filtered.map(a => ({
          address: a.address,
          symbol: a.symbol,
          balance: a.balance, // smallest units (wei, satoshi, etc.)
          decimals: a.decimals, // actual token decimals (6 for USDC, 18 for ETH, etc.)
        }));

        // Keep native first, then others; native has address === null
        tokenList.sort((a, b) => (a.address === null ? -1 : b.address === null ? 1 : 0));

        setTokens(tokenList);
        if (tokenList.length > 0) {
          // Select first token (native token) by default
          const firstToken = tokenList[0];
          if (firstToken) {
            setSelectedToken(firstToken);
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof ApiError 
        ? err.message 
        : "Failed to load tokens. Please try again.";
      setError(errorMessage);
    } finally {
      setLoadingTokens(false);
    }
  }, [userId, chain]);

  // Load tokens when modal opens
  useEffect(() => {
    if (open && userId && chain) {
      loadTokens();
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
    }
  }, [open, userId, chain, loadTokens]);

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
    const addressError = validateAddress(recipientAddress, chain);
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

    // Track send button click (already tracked in wallet-info, but track here too for modal context)
    trackTransaction.sendClicked();

    setLoading(true);
    setError(null);

    try {
      // Check if this is a Substrate chain
      const SUBSTRATE_CHAINS = ["polkadot", "hydrationSubstrate", "bifrostSubstrate", "uniqueSubstrate", "paseo", "paseoAssethub"];
      const isSubstrate = SUBSTRATE_CHAINS.includes(chain);

      // Check if this is an Aptos chain
      const APTOS_CHAINS = ["aptos", "aptosTestnet"];
      const isAptos = APTOS_CHAINS.includes(chain);

      // Check if this is an EIP-7702 gasless chain
      const isGasless = isEip7702Chain(chain);

      let result: { txHash: string; userOpHash?: string; explorerUrl?: string; isFirstTransaction?: boolean };

      if (isGasless) {
        // Use EIP-7702 gasless endpoint
        const chainId = EIP7702_CHAIN_IDS[chain];
        if (!chainId) {
          throw new Error(`Chain ID not found for ${chain}`);
        }

        const gaslessResult = await walletApi.sendEip7702Gasless({
          userId,
          chainId,
          recipientAddress: recipientAddress.trim(),
          amount: amount, // Human-readable amount
          tokenAddress: selectedToken.address || undefined,
          tokenDecimals: selectedToken.address ? selectedToken.decimals : undefined,
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
          chain,
          to: recipientAddress.trim(),
          amount: amountInSmallestUnits, // Amount in smallest units
          useTestnet: false, // TODO: Add testnet toggle if needed
          transferMethod: 'transferAllowDeath', // Default transfer method
        });

        result = { txHash: substrateResult.txHash };
      } else if (isAptos) {
        // Use Aptos send endpoint
        const network = chain === "aptosTestnet" ? "testnet" : "mainnet";
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
          chain,
          tokenAddress: selectedToken.address || undefined,
          tokenDecimals: selectedToken.decimals,
          amount: amount, // human-readable amount; server converts using ERC-20 decimals / Zerion
          recipientAddress: recipientAddress.trim(),
        });
        result = { txHash: sendResult.txHash };
      }

      setTxHash(result.txHash);
      setSuccess(true);

      // Track successful send transaction
      trackTransaction.sendCompleted(
        result.txHash,
        amount,
        selectedToken.symbol,
        chain,
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

  const chainName = CHAIN_NAMES[chain] || chain;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-black/90 text-white shadow-2xl backdrop-blur sm:max-w-[300px] p-0 rounded-2xl [&>button]:text-white [&>button]:hover:text-white [&>button]:hover:bg-white/20 [&>button]:opacity-100">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <ChainIcon className="h-6 w-6" />
            {chainName}
            {isEip7702Chain(chain) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                <Zap className="h-3 w-3" />
                Sponsored
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm text-white/60">
            {isEip7702Chain(chain) 
              ? "Gas-free transfer - fees are sponsored" 
              : "Transfer to recipient address"}
          </DialogDescription>
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
              <div className="text-xs text-red-400 py-2">No tokens available</div>
            ) : (
              <Select
                value={selectedToken?.address || "native"}
                onValueChange={(value) => {
                  const token = tokens.find(t => (t.address || "native") === value);
                  setSelectedToken(token ?? null);
                }}
              >
                <SelectTrigger id="token" className="h-9 rounded-xl border-white/20 bg-white/5 text-sm text-white hover:bg-white/10">
                  <SelectValue placeholder="Select token" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/20 bg-black/95 text-white">
                  {tokens.map((token) => (
                    <SelectItem 
                      key={token.address || "native"} 
                      value={token.address || "native"}
                      className="text-sm focus:bg-white/10 focus:text-white"
                    >
                      {token.symbol} - {formatBalance(token.balance, token.decimals)}
                    </SelectItem>
                  ))}
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
                href={getExplorerUrl(txHash, chain)}
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
    </Dialog>
  );
}
