'use client';

import { ExternalLink, ArrowUpRight, ArrowDownLeft, RefreshCcw, Loader2, CheckCircle2, XCircle, ChevronDown, ListFilter } from 'lucide-react';
import { useWalletData } from '@/hooks/useWalletData';
import { useMemo, useState } from 'react';
import Image from 'next/image';



// Define the shape of a generic transaction for UI
interface Transaction {
    id: string;
    type: 'receive' | 'send' | 'approve' | 'unknown';
    status: 'confirmed' | 'failed' | 'pending';
    assetName: string;
    assetSymbol: string;
    assetIcon?: string;
    chain: string;
    hash: string;
    addressDisplay: string; // Truncated address
    amount: string;
    amountValue: string;
    date: string;
    timestamp: number;
}

const MOCK_TRANSACTIONS: Transaction[] = [
    {
        id: '1',
        type: 'receive',
        status: 'confirmed',
        assetName: 'Ethereum',
        assetSymbol: 'ETH',
        assetIcon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
        chain: 'Base',
        hash: '0x123abc456def7890123abc456def7890123abc45',
        addressDisplay: '0x123...c45',
        amount: '+ 0.5 ETH',
        amountValue: '$1,250.00',
        date: '2 hours ago',
        timestamp: Date.now() - 7200000,
    },
    {
        id: '2',
        type: 'send',
        status: 'confirmed',
        assetName: 'USD Coin',
        assetSymbol: 'USDC',
        assetIcon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
        chain: 'Ethereum',
        hash: '0xdef456abc7890123def456abc7890123def456a',
        addressDisplay: '0xdef...56a',
        amount: '- 100 USDC',
        amountValue: '- $100.00',
        date: '5 hours ago',
        timestamp: Date.now() - 18000000,
    },
    {
        id: '3',
        type: 'send',
        status: 'failed',
        assetName: 'Arbitrum',
        assetSymbol: 'ARB',
        assetIcon: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png',
        chain: 'Arbitrum',
        hash: '0x789xyz0123abc456789xyz0123abc456789xyz0',
        addressDisplay: '0x789...yz0',
        amount: '- 50 ARB',
        amountValue: '- $90.25',
        date: '1 day ago',
        timestamp: Date.now() - 86400000,
    },

    {
        id: '5',
        type: 'receive',
        status: 'confirmed',
        assetName: 'USD Coin',
        assetSymbol: 'USDC',
        assetIcon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
        chain: 'Base',
        hash: '0xdec456...',
        addressDisplay: '0xdec...456',
        amount: '+ 500 USDC',
        amountValue: '+ $500.00',
        date: 'Dec 01, 2025',
        timestamp: new Date('2025-12-01T15:30:00').getTime(),
    },
];

export function TransactionList() {
    const { transactions: realTransactions, loading, errors } = useWalletData();
    const [filterType, setFilterType] = useState<'date' | 'month' | 'year'>('date');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // 1. Process Real Transactions
    const processedRealTransactions: Transaction[] = useMemo(() => {
        return realTransactions
            .filter((tx: any) => tx.type !== 'swap') // Explicitly exclude swaps
            .map((tx: any) => {
                const type = tx.type === 'receive' ? 'receive' :
                    tx.type === 'send' ? 'send' : 'unknown';

                const status = tx.status === 'failed' ? 'failed' : 'confirmed';

                const amount = tx.quantity ? `${type === 'receive' ? '+' : '-'} ${parseFloat(tx.quantity).toFixed(4)} ${tx.symbol}` : '';
                const amountValue = tx.value ? `$${tx.value.toFixed(2)}` : '';

                return {
                    id: tx.hash || tx.id || Math.random().toString(),
                    type: type as 'receive' | 'send' | 'approve' | 'unknown',
                    status: status as 'confirmed' | 'failed' | 'pending',
                    assetName: tx.asset?.name || tx.symbol || 'Unknown Asset',
                    assetSymbol: tx.symbol || '',
                    assetIcon: tx.asset?.icon?.url,
                    chain: tx.chain || 'Unknown Chain',
                    hash: tx.hash,
                    addressDisplay: tx.hash ? `${tx.hash.slice(0, 6)}...${tx.hash.slice(-4)}` : 'Unknown',
                    amount,
                    amountValue,
                    date: new Date(tx.minedAt || tx.timestamp).toLocaleDateString(),
                    timestamp: new Date(tx.minedAt || tx.timestamp).getTime(),
                };
            }).sort((a, b) => b.timestamp - a.timestamp);
    }, [realTransactions]);

    // 2. Decide Mock Data Fallback
    const isDev = process.env.NODE_ENV === 'development';
    // const showMockData = isDev && (processedRealTransactions.length === 0 || errors.transactions);
    const showMockData = false; // Force empty state as requested

    const transactions = showMockData ? MOCK_TRANSACTIONS : processedRealTransactions;
    const isLoading = loading.transactions && transactions.length === 0;

    // 3. Group Transactions based on Filter
    const groupedTransactions = useMemo(() => {
        const groups: { [key: string]: Transaction[] } = {};

        transactions.forEach((tx) => {
            const date = new Date(tx.timestamp);
            let key = '';

            if (filterType === 'date') {
                const today = new Date();
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);

                if (date.toDateString() === today.toDateString()) {
                    key = 'Today';
                } else if (date.toDateString() === yesterday.toDateString()) {
                    key = 'Yesterday';
                } else {
                    key = date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
                }
            } else if (filterType === 'month') {
                key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            } else if (filterType === 'year') {
                key = date.getFullYear().toString();
            }

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key]?.push(tx);
        });

        return groups;
    }, [transactions, filterType]);

    // Helper to open explorer
    const openExplorer = (hash: string, chain: string) => {
        const baseUrl = chain.toLowerCase() === 'polygon' ? 'https://polygonscan.com/tx/' :
            chain.toLowerCase() === 'base' ? 'https://basescan.org/tx/' :
                'https://etherscan.io/tx/';
        window.open(`${baseUrl}${hash}`, '_blank');
    };

    if (isLoading) {
        return (
            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-gray-300 animate-spin" />
            </div>
        );
    }


    // Sort Keys Logic
    const sortedKeys = Object.keys(groupedTransactions).sort((a, b) => {
        // Custom sorting priorities
        if (a === 'Today') return -1;
        if (b === 'Today') return 1;
        if (a === 'Yesterday') return -1;
        if (b === 'Yesterday') return 1;

        // For others, try to parse as date for sorting descending.
        const dateA = new Date(a).getTime();
        const dateB = new Date(b).getTime();
        if (!isNaN(dateA) && !isNaN(dateB)) {
            return dateB - dateA;
        }
        return b.localeCompare(a);
    });

    const filterOptions = [
        { id: 'date', label: 'Datewise' },
        { id: 'month', label: 'Monthly' },
        { id: 'year', label: 'Yearly' },
    ];

    return (
        <div className="bg-white rounded-3xl p-3 border border-gray-100 shadow-sm space-y-2 h-[340px] flex flex-col">
            <div className="flex items-center justify-between">

                {/* Filter Dropdown (Sleek) */}
                <div className="relative">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-900 border border-transparent hover:border-gray-200"
                        >
                            <ListFilter className="w-5 h-5" />
                        </button>

                        <span className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-semibold text-gray-700 select-none">
                            {filterOptions.find(o => o.id === filterType)?.label}
                        </span>
                    </div>

                    {isDropdownOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-10"
                                onClick={() => setIsDropdownOpen(false)}
                            />
                            <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 py-2 z-20 overflow-hidden ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
                                {filterOptions.map((option) => (
                                    <button
                                        key={option.id}
                                        onClick={() => {
                                            setFilterType(option.id as any);
                                            setIsDropdownOpen(false);
                                        }}
                                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-all flex items-center justify-between
                                            ${filterType === option.id
                                                ? 'bg-gray-50 text-gray-900 font-semibold'
                                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                            }`}
                                    >
                                        {option.label}
                                        {filterType === option.id && (
                                            <CheckCircle2 className="w-4 h-4 text-gray-900" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>


            </div>

            <div className="space-y-2 flex-1 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
                {transactions.length === 0 ? (
                    /* Empty State Animation (Below Filter Header) */
                    <div className="flex flex-col items-center justify-center pb-4 -mt-6">
                        <div className="pointer-events-none transform scale-75 sm:scale-90 -mb-4">
                            <Image
                                src="/empty-mailbox-illustration-with-spiderweb-and-flie-2025-10-20-04-28-09-utc.gif"
                                alt="No Transaction Available"
                                width={320}
                                height={320}
                                className="object-contain mix-blend-multiply"
                            />
                        </div>
                        <p className="text-gray-500 text-sm font-rubik-normal z-10 -mt-8 relative">
                            No Transaction Available
                        </p>
                    </div>
                ) : (
                    /* Transaction List */
                    sortedKeys.map((dateKey) => (
                        <div key={dateKey} className="space-y-3">
                            <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pl-1 pt-0">
                                {dateKey}
                            </h3>
                            <div className="space-y-1">
                                {groupedTransactions[dateKey]?.map((tx) => (
                                    <div
                                        key={tx.id}
                                        className="group flex items-center justify-between p-2 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all duration-200 cursor-default"
                                    >
                                        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">

                                            {/* 1. Asset Logo with Direction Arrow Badge */}
                                            <div className="relative shrink-0">
                                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-100">
                                                    {tx.assetIcon ? (
                                                        <Image src={tx.assetIcon} alt={tx.assetSymbol} width={32} height={32} className="object-cover" />
                                                    ) : (
                                                        <span className="text-xs font-bold text-gray-500">{tx.assetSymbol.slice(0, 2)}</span>
                                                    )}
                                                </div>
                                                <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center
                                                    ${tx.type === 'receive' ? 'bg-emerald-100 text-emerald-600' :
                                                        tx.type === 'send' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}
                                                >
                                                    {tx.type === 'receive' && <ArrowDownLeft className="w-3 h-3" />}
                                                    {tx.type === 'send' && <ArrowUpRight className="w-3 h-3" />}
                                                    {(tx.type === 'approve' || tx.type === 'unknown') && <RefreshCcw className="w-2.5 h-2.5" />}
                                                </div>
                                            </div>

                                            {/* 2. Asset Name, Chain, Status */}
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <h3 className="text-sm font-bold text-gray-900 leading-tight truncate">
                                                    {tx.assetSymbol}
                                                </h3>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="text-xs font-medium text-gray-500 truncate max-w-[80px] sm:max-w-none">
                                                        {tx.chain}
                                                    </span>
                                                    <span className="text-[10px] text-gray-300">•</span>
                                                    <span className={`text-xs font-medium flex items-center gap-1 whitespace-nowrap
                                                        ${tx.status === 'confirmed' ? 'text-emerald-600' :
                                                            tx.status === 'failed' ? 'text-red-500' : 'text-amber-500'}`}
                                                    >
                                                        {tx.status === 'confirmed' ? 'Confirmed' :
                                                            tx.status === 'failed' ? 'Failed' : 'Pending'}
                                                    </span>

                                                    {/* Mobile-only Link Icon */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openExplorer(tx.hash, tx.chain);
                                                        }}
                                                        className="sm:hidden -ml-0.5 p-1 rounded-full text-gray-400 hover:text-blue-600 hover:bg-gray-100 transition-colors"
                                                        title="View on Explorer"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* 3. Address with Open Box Arrow (Link) */}
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openExplorer(tx.hash, tx.chain);
                                                }}
                                                className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-100 cursor-pointer text-gray-500 hover:text-blue-600 transition-colors group/link"
                                            >
                                                <span className="text-xs font-mono font-medium">
                                                    {tx.addressDisplay}
                                                </span>
                                                <ExternalLink className="w-3 h-3 opacity-50 group-hover/link:opacity-100" />
                                            </div>

                                        </div>

                                        {/* 4. Amount (Right Aligned) */}
                                        <div className="text-right pl-2 sm:pl-4 shrink-0">
                                            <p className={`text-sm font-bold whitespace-nowrap ${tx.type === 'receive' ? 'text-emerald-600' : 'text-gray-900'}`}>
                                                {tx.amount}
                                            </p>
                                            <p className="text-xs font-medium text-gray-400 whitespace-nowrap">
                                                {tx.amountValue}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
