/**
 * COMMENTED OUT - REDUNDANT CODE
 * This is an example/demo component that is not used in the actual application.
 * Keeping this commented out for reference in case it's needed later.
 * Date: 2025-12-08
 */

/*
'use client';

import React from 'react';
// Import specific chain icons from the package
import Ethereum from '@thirdweb-dev/chain-icons/dist/ethereum';
import Bitcoin from '@thirdweb-dev/chain-icons/dist/bitcoin';
import Solana from '@thirdweb-dev/chain-icons/dist/solana';
import Tron from '@thirdweb-dev/chain-icons/dist/tron';
import Polygon from '@thirdweb-dev/chain-icons/dist/polygon';
import Avalanche from '@thirdweb-dev/chain-icons/dist/avalanche';
import BinanceCoin from '@thirdweb-dev/chain-icons/dist/binance-coin';
import Optimism from '@thirdweb-dev/chain-icons/dist/optimism';
import Arbitrum from '@thirdweb-dev/chain-icons/dist/arbitrum';

/**
 * Example component demonstrating how to use chain icons
 * You can use this as a reference and adapt it to your needs
 *\/
export function CryptoIconsExample() {
  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-rubik-bold">Crypto Chain Icons</h2>
      
      {/* Basic usage - default size */}
      <div className="space-y-4">
        <h3 className="text-lg font-rubik-medium">Default Size</h3>
        <div className="flex items-center gap-4">
          <Ethereum />
          <Bitcoin />
          <Solana />
          <Tron />
          <Polygon />
          <Avalanche />
          <BinanceCoin />
          <Optimism />
          <Arbitrum />
        </div>
      </div>

      {/* Custom size using className */}
      <div className="space-y-4">
        <h3 className="text-lg font-rubik-medium">Custom Size (32px)</h3>
        <div className="flex items-center gap-4">
          <Ethereum className="w-8 h-8" />
          <Bitcoin className="w-8 h-8" />
          <Solana className="w-8 h-8" />
          <Tron className="w-8 h-8" />
          <Polygon className="w-8 h-8" />
          <Avalanche className="w-8 h-8" />
          <BinanceCoin className="w-8 h-8" />
          <Optimism className="w-8 h-8" />
          <Arbitrum className="w-8 h-8" />
        </div>
      </div>

      {/* Large icons */}
      <div className="space-y-4">
        <h3 className="text-lg font-rubik-medium">Large Size (64px)</h3>
        <div className="flex items-center gap-4">
          <Ethereum className="w-16 h-16" />
          <Bitcoin className="w-16 h-16" />
          <Solana className="w-16 h-16" />
          <Tron className="w-16 h-16" />
          <Polygon className="w-16 h-16" />
          <Avalanche className="w-16 h-16" />
        </div>
      </div>

      {/* With labels - example for wallet selection */}
      <div className="space-y-4">
        <h3 className="text-lg font-rubik-medium">With Labels</h3>
        <div className="flex gap-4 flex-wrap">
          {[
            { icon: Ethereum, name: 'Ethereum' },
            { icon: Bitcoin, name: 'Bitcoin' },
            { icon: Solana, name: 'Solana' },
            { icon: Tron, name: 'Tron' },
            { icon: Polygon, name: 'Polygon' },
            { icon: Avalanche, name: 'Avalanche' },
            { icon: BinanceCoin, name: 'BSC' },
          ].map(({ icon: Icon, name }) => (
            <div 
              key={name}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#161616] hover:bg-[#202020] transition-colors cursor-pointer"
            >
              <Icon className="w-12 h-12" />
              <span className="text-sm font-rubik-medium">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
*/
